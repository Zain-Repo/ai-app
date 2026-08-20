import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { getCurrentUser } from "./authHelpers"
import { consumeDraftAttachments } from "./attachments"
import {
  imageGenerationConfigValidator,
  imageModelCapabilityValidator,
} from "./imageGenerationPolicy"
import { indexMessageAttachments } from "./library"
import { createFallbackChatTitle } from "../shared/chat-title"
import {
  getImageOutputRange,
  validateImageGenerationConfig,
} from "../shared/image-generation"

const MAX_MESSAGES = 200
const MAX_PROMPT_LENGTH = 32_000
const MAX_GENERATION_SETS = 50
const MAX_GENERATION_ATTEMPTS = 10
const ALLOWED_IMAGE_REFERENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

const outputViewValidator = v.object({
  _id: v.id("imageGenerationOutputs"),
  ordinal: v.number(),
  status: v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("succeeded"),
    v.literal("failed"),
    v.literal("canceled")
  ),
  name: v.optional(v.string()),
  contentType: v.optional(v.string()),
  size: v.optional(v.number()),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  seed: v.optional(v.number()),
  errorCode: v.optional(v.string()),
  url: v.optional(v.string()),
})

const generationSetViewValidator = v.object({
  _id: v.id("imageGenerationSets"),
  assistantMessageId: v.id("messages"),
  prompt: v.string(),
  provider: v.union(
    v.literal("fal"),
    v.literal("openrouter"),
    v.literal("ai_gateway")
  ),
  model: v.string(),
  endpoint: v.optional(v.string()),
  config: imageGenerationConfigValidator,
  capabilityRevision: v.string(),
  requestedMinimum: v.number(),
  requestedMaximum: v.number(),
  pricingKind: v.union(
    v.literal("exact"),
    v.literal("from"),
    v.literal("range"),
    v.literal("unknown")
  ),
  pricingDisplay: v.optional(v.string()),
  status: v.union(
    v.literal("queued"),
    v.literal("running"),
    v.literal("partial"),
    v.literal("complete"),
    v.literal("failed"),
    v.literal("canceled")
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
  outputs: v.array(outputViewValidator),
})

function normalizePrompt(content: string) {
  const prompt = content.trim()
  if (!prompt) throw new Error("Describe the image you want to create")
  if (prompt.length > MAX_PROMPT_LENGTH) throw new Error("Prompt is too long")
  return prompt
}

function normalizeIdempotencyKey(value: string) {
  const normalized = value.trim()
  if (!/^[A-Za-z0-9_-]{12,100}$/.test(normalized))
    throw new Error("Generation request is invalid")
  return normalized
}

async function getOwnedGenerationSet(
  ctx: MutationCtx,
  generationSetId: Id<"imageGenerationSets">,
  ownerId: Id<"users">
) {
  const generationSet = await ctx.db.get(generationSetId)
  if (!generationSet || generationSet.ownerId !== ownerId)
    throw new Error("Image generation is unavailable")
  return generationSet
}

async function getOwnedGenerationSetForQuery(
  ctx: QueryCtx,
  generationSetId: Id<"imageGenerationSets">,
  ownerId: Id<"users">
) {
  const generationSet = await ctx.db.get(generationSetId)
  if (!generationSet || generationSet.ownerId !== ownerId)
    throw new Error("Image generation is unavailable")
  return generationSet
}

async function getLatestJob(
  ctx: Pick<MutationCtx, "db">,
  generationSetId: Id<"imageGenerationSets">
) {
  return await ctx.db
    .query("imageGenerationJobs")
    .withIndex("by_generation_set_id_and_attempt", (indexQuery) =>
      indexQuery.eq("generationSetId", generationSetId)
    )
    .order("desc")
    .first()
}

export const createGenerationRequest = internalMutation({
  args: {
    capability: imageModelCapabilityValidator,
    clientRequestId: v.string(),
    config: imageGenerationConfigValidator,
    content: v.string(),
    conversationId: v.optional(v.string()),
    draftAttachmentIds: v.optional(v.array(v.id("draftAttachments"))),
    model: v.string(),
    projectId: v.optional(v.string()),
    providerConnectionId: v.id("providerConnections"),
    routingProvider: v.optional(v.string()),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    generationSetId: v.id("imageGenerationSets"),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const prompt = normalizePrompt(args.content)
    const idempotencyKey = normalizeIdempotencyKey(args.clientRequestId)
    const existing = await ctx.db
      .query("imageGenerationSets")
      .withIndex("by_owner_id_and_idempotency_key", (indexQuery) =>
        indexQuery.eq("ownerId", user._id).eq("idempotencyKey", idempotencyKey)
      )
      .unique()
    if (existing)
      return {
        conversationId: existing.conversationId,
        generationSetId: existing._id,
      }

    const connection = await ctx.db.get(args.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== user._id ||
      connection.status !== "connected" ||
      connection.provider !== args.capability.provider ||
      !["fal", "openrouter", "ai_gateway"].includes(connection.provider)
    )
      throw new Error("Image provider is unavailable")
    if (args.capability.modelId !== args.model)
      throw new Error("Image model capability is stale")

    const config = validateImageGenerationConfig(args.capability, args.config)
    const referenceLimit = Math.min(args.capability.references.max, 5)
    const attachments = await consumeDraftAttachments(
      ctx,
      user._id,
      args.draftAttachmentIds ?? []
    )
    if (
      attachments.some(
        (attachment) =>
          !ALLOWED_IMAGE_REFERENCE_TYPES.has(attachment.contentType)
      )
    )
      throw new Error("Image references must be PNG, JPEG, or WebP files")
    if (attachments.length > referenceLimit)
      throw new Error(
        referenceLimit
          ? `This model supports at most ${referenceLimit} reference images`
          : "This model does not support reference images"
      )

    const now = Date.now()
    let conversation: Doc<"conversations">
    let branchId: Id<"conversationBranches">
    if (args.conversationId) {
      const conversationId = ctx.db.normalizeId(
        "conversations",
        args.conversationId
      )
      if (!conversationId) throw new Error("Image thread is unavailable")
      const current = await ctx.db.get(conversationId)
      if (
        !current ||
        current.ownerId !== user._id ||
        current.status !== "active" ||
        current.outputMode !== "image" ||
        current.providerConnectionId !== connection._id
      )
        throw new Error("Image thread is unavailable")
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation", (indexQuery) =>
          indexQuery.eq("conversationId", current._id)
        )
        .take(MAX_MESSAGES + 1)
      if (messages.length > MAX_MESSAGES - 2)
        throw new Error("Image thread has reached its message limit")
      if (
        messages.some(
          (message) =>
            message.role === "assistant" &&
            (message.status === "pending" || message.status === "streaming")
        )
      )
        throw new Error("Wait for the current generation to finish")
      if (current.activeBranchId) {
        const branch = await ctx.db.get(current.activeBranchId)
        if (!branch || branch.conversationId !== current._id)
          throw new Error("Image thread branch is unavailable")
        branchId = branch._id
      } else {
        branchId = await ctx.db.insert("conversationBranches", {
          conversationId: current._id,
          createdAt: now,
        })
        await ctx.db.patch(current._id, { activeBranchId: branchId })
      }
      conversation = current
    } else {
      const projectId = args.projectId
        ? ctx.db.normalizeId("projects", args.projectId)
        : null
      if (args.projectId && !projectId) throw new Error("Project unavailable")
      if (projectId) {
        const project = await ctx.db.get(projectId)
        if (!project || project.ownerId !== user._id)
          throw new Error("Project unavailable")
      }
      const conversationId = await ctx.db.insert("conversations", {
        ownerId: user._id,
        ...(projectId ? { projectId } : {}),
        title: createFallbackChatTitle(prompt),
        titleGenerationStatus: "pending",
        status: "active",
        providerConnectionId: connection._id,
        model: args.model,
        outputMode: "image",
        ...(args.routingProvider
          ? { routingProvider: args.routingProvider }
          : {}),
        updatedAt: now,
      })
      branchId = await ctx.db.insert("conversationBranches", {
        conversationId,
        createdAt: now,
      })
      await ctx.db.patch(conversationId, { activeBranchId: branchId })
      const created = await ctx.db.get(conversationId)
      if (!created) throw new Error("Image thread could not be created")
      conversation = created
    }

    const existingGenerationSets = await ctx.db
      .query("imageGenerationSets")
      .withIndex("by_conversation_id_and_created_at", (indexQuery) =>
        indexQuery.eq("conversationId", conversation._id)
      )
      .take(MAX_GENERATION_SETS)
    if (existingGenerationSets.length >= MAX_GENERATION_SETS)
      throw new Error("Image thread has reached its generation limit")

    const userMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      branchId,
      role: "user",
      content: prompt,
      ...(attachments.length ? { attachments } : {}),
      status: "complete",
      provider: connection.provider,
      model: args.model,
      outputMode: "image",
      ...(args.routingProvider
        ? { routingProvider: args.routingProvider }
        : {}),
    })
    await indexMessageAttachments(ctx, {
      ownerId: user._id,
      conversationId: conversation._id,
      messageId: userMessageId,
      role: "user",
      attachments,
      createdAt: now,
    })
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      branchId,
      role: "assistant",
      content: "",
      status: "pending",
      provider: connection.provider,
      model: args.model,
      outputMode: "image",
      ...(args.routingProvider
        ? { routingProvider: args.routingProvider }
        : {}),
    })
    const outputRange = getImageOutputRange(args.capability, config)
    const generationSetId = await ctx.db.insert("imageGenerationSets", {
      ownerId: user._id,
      conversationId: conversation._id,
      userMessageId,
      assistantMessageId,
      providerConnectionId: connection._id,
      provider: args.capability.provider,
      model: args.model,
      ...(args.capability.endpoint
        ? { endpoint: args.capability.endpoint }
        : {}),
      prompt,
      config,
      capabilityRevision: args.capability.revision,
      requestedMinimum: outputRange.minimum,
      requestedMaximum: outputRange.maximum,
      pricingKind: args.capability.pricing.kind,
      ...(args.capability.pricing.display
        ? { pricingDisplay: args.capability.pricing.display }
        : {}),
      status: "queued",
      idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(assistantMessageId, { generationSetId })
    const generationJobId = await ctx.db.insert("imageGenerationJobs", {
      generationSetId,
      attempt: 1,
      requestedOutputs: outputRange.maximum,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    })
    for (let ordinal = 0; ordinal < outputRange.maximum; ordinal += 1)
      await ctx.db.insert("imageGenerationOutputs", {
        generationSetId,
        generationJobId,
        ordinal,
        status: "queued",
        createdAt: now,
        updatedAt: now,
      })

    await ctx.db.patch(branchId, { lastMessageId: assistantMessageId })
    await ctx.db.patch(conversation._id, {
      model: args.model,
      routingProvider: args.routingProvider,
      updatedAt: now,
      ...(!conversation.titleSourceMessageId
        ? { titleSourceMessageId: userMessageId }
        : {}),
    })
    await ctx.scheduler.runAfter(0, internal.memoryCapture.enqueueForMessage, {
      conversationId: conversation._id,
      messageId: userMessageId,
      ownerId: user._id,
    })
    if (!args.conversationId && connection.provider === "openrouter")
      await ctx.scheduler.runAfter(
        0,
        internal.openRouterResponses.generateTitle,
        { conversationId: conversation._id }
      )
    const scheduledGenerationId = await ctx.scheduler.runAfter(
      0,
      internal.openRouterResponses.generate,
      {
        assistantMessageId,
        conversationId: conversation._id,
        imageGenerationJobId: generationJobId,
      }
    )
    await ctx.db.patch(assistantMessageId, { scheduledGenerationId })

    return { conversationId: conversation._id, generationSetId }
  },
})

export const claimExecution = internalMutation({
  args: {
    assistantMessageId: v.id("messages"),
    generationJobId: v.id("imageGenerationJobs"),
  },
  returns: v.union(
    v.null(),
    v.object({
      generationSetId: v.id("imageGenerationSets"),
      generationJobId: v.id("imageGenerationJobs"),
      capabilityRevision: v.string(),
      config: imageGenerationConfigValidator,
      endpoint: v.optional(v.string()),
    })
  ),
  handler: async (ctx, args) => {
    const generationSet = await ctx.db
      .query("imageGenerationSets")
      .withIndex("by_assistant_message_id", (indexQuery) =>
        indexQuery.eq("assistantMessageId", args.assistantMessageId)
      )
      .unique()
    const job = await ctx.db.get(args.generationJobId)
    const latestJob = generationSet
      ? await getLatestJob(ctx, generationSet._id)
      : null
    const message = await ctx.db.get(args.assistantMessageId)
    if (
      !generationSet ||
      !job ||
      job.generationSetId !== generationSet._id ||
      latestJob?._id !== job._id ||
      generationSet.status !== "queued" ||
      job.status !== "queued" ||
      message?.generationSetId !== generationSet._id ||
      message.status !== "pending"
    )
      return null
    const now = Date.now()
    await ctx.db.patch(generationSet._id, { status: "running", updatedAt: now })
    await ctx.db.patch(job._id, { status: "running", updatedAt: now })
    const outputs = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_job_id_and_ordinal", (indexQuery) =>
        indexQuery.eq("generationJobId", job._id)
      )
      .take(4)
    for (const output of outputs)
      if (output.status === "queued")
        await ctx.db.patch(output._id, { status: "running", updatedAt: now })
    return {
      generationSetId: generationSet._id,
      generationJobId: job._id,
      capabilityRevision: generationSet.capabilityRevision,
      config: generationSet.config,
      ...(generationSet.endpoint ? { endpoint: generationSet.endpoint } : {}),
    }
  },
})

export const shouldCancelExecution = internalQuery({
  args: {
    assistantMessageId: v.id("messages"),
    generationJobId: v.id("imageGenerationJobs"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const generationSet = await ctx.db
      .query("imageGenerationSets")
      .withIndex("by_assistant_message_id", (indexQuery) =>
        indexQuery.eq("assistantMessageId", args.assistantMessageId)
      )
      .unique()
    if (!generationSet || generationSet.status !== "running") return true
    const [job, latestJob] = await Promise.all([
      ctx.db.get(args.generationJobId),
      ctx.db
        .query("imageGenerationJobs")
        .withIndex("by_generation_set_id_and_attempt", (indexQuery) =>
          indexQuery.eq("generationSetId", generationSet._id)
        )
        .order("desc")
        .first(),
    ])
    return (
      !job ||
      job.generationSetId !== generationSet._id ||
      latestJob?._id !== job._id ||
      job.status !== "running"
    )
  },
})

const completedOutputValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  width: v.optional(v.number()),
  height: v.optional(v.number()),
  seed: v.optional(v.number()),
})

export const stageOutput = internalMutation({
  args: {
    generationSetId: v.id("imageGenerationSets"),
    generationJobId: v.id("imageGenerationJobs"),
    ordinal: v.number(),
    output: completedOutputValidator,
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const generationSet = await ctx.db.get(args.generationSetId)
    const job = await ctx.db.get(args.generationJobId)
    const latestJob = generationSet
      ? await getLatestJob(ctx, generationSet._id)
      : null
    if (
      !generationSet ||
      !job ||
      job.generationSetId !== generationSet._id ||
      latestJob?._id !== job._id ||
      generationSet.status !== "running" ||
      job.status !== "running" ||
      !Number.isSafeInteger(args.ordinal) ||
      args.ordinal < 0 ||
      args.ordinal >= generationSet.requestedMaximum
    )
      return false
    const slot = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_set_id_and_ordinal", (indexQuery) =>
        indexQuery
          .eq("generationSetId", generationSet._id)
          .eq("ordinal", args.ordinal)
      )
      .unique()
    if (
      !slot ||
      slot.generationJobId !== job._id ||
      slot.status !== "running" ||
      slot.storageId
    )
      return false
    const now = Date.now()
    await ctx.db.patch(slot._id, { ...args.output, updatedAt: now })
    return true
  },
})

export const completeGeneration = internalMutation({
  args: {
    generationSetId: v.id("imageGenerationSets"),
    generationJobId: v.id("imageGenerationJobs"),
    providerRequestId: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const generationSet = await ctx.db.get(args.generationSetId)
    const job = await ctx.db.get(args.generationJobId)
    const latestJob = generationSet
      ? await getLatestJob(ctx, generationSet._id)
      : null
    const message = generationSet
      ? await ctx.db.get(generationSet.assistantMessageId)
      : null
    if (
      !generationSet ||
      !job ||
      job.generationSetId !== generationSet._id ||
      latestJob?._id !== job._id ||
      generationSet.status !== "running" ||
      job.status !== "running" ||
      message?.generationSetId !== generationSet._id ||
      message.status !== "pending"
    )
      return false

    const slots = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_job_id_and_ordinal", (indexQuery) =>
        indexQuery.eq("generationJobId", job._id)
      )
      .order("asc")
      .take(4)
    const completedSlots = slots.filter(
      (slot) =>
        slot.storageId &&
        slot.name &&
        slot.contentType &&
        slot.size !== undefined
    )
    if (!completedSlots.length) return false
    const now = Date.now()
    const attachments = completedSlots.map((slot) => ({
      storageId: slot.storageId!,
      name: slot.name!,
      contentType: slot.contentType!,
      size: slot.size!,
    }))
    await ctx.db.patch(message._id, {
      attachments,
      content: "",
      status: "complete",
      scheduledGenerationId: undefined,
    })
    await indexMessageAttachments(ctx, {
      ownerId: generationSet.ownerId,
      conversationId: generationSet.conversationId,
      messageId: message._id,
      role: "assistant",
      attachments,
      createdAt: now,
      outputMode: "image",
      provider: generationSet.provider,
      model: generationSet.model,
    })
    for (const slot of slots) {
      if (!slot.storageId) {
        await ctx.db.patch(slot._id, {
          status: "failed",
          errorCode: "provider_returned_fewer_outputs",
          updatedAt: now,
        })
        continue
      }
      const libraryAsset = await ctx.db
        .query("libraryAssets")
        .withIndex("by_message_id_and_storage_id", (indexQuery) =>
          indexQuery
            .eq("messageId", generationSet.assistantMessageId)
            .eq("storageId", slot.storageId!)
        )
        .unique()
      await ctx.db.patch(slot._id, {
        status: "succeeded",
        ...(libraryAsset ? { libraryAssetId: libraryAsset._id } : {}),
        updatedAt: now,
      })
      if (libraryAsset)
        await ctx.db.patch(libraryAsset._id, {
          generationSetId: generationSet._id,
          generationOutputId: slot._id,
        })
    }
    const succeeded = completedSlots.length
    const status =
      succeeded >= generationSet.requestedMinimum
        ? "complete"
        : succeeded
          ? "partial"
          : "failed"
    await ctx.db.patch(job._id, {
      status: succeeded ? "complete" : "failed",
      ...(args.providerRequestId
        ? { providerRequestId: args.providerRequestId.slice(0, 200) }
        : {}),
      updatedAt: now,
    })
    await ctx.db.patch(generationSet._id, { status, updatedAt: now })
    return true
  },
})

export const failGeneration = internalMutation({
  args: {
    generationSetId: v.id("imageGenerationSets"),
    generationJobId: v.id("imageGenerationJobs"),
    errorCode: v.string(),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const generationSet = await ctx.db.get(args.generationSetId)
    const job = await ctx.db.get(args.generationJobId)
    const latestJob = generationSet
      ? await getLatestJob(ctx, generationSet._id)
      : null
    if (
      !generationSet ||
      !job ||
      job.generationSetId !== generationSet._id ||
      latestJob?._id !== job._id ||
      generationSet.status !== "running" ||
      job.status !== "running"
    )
      return null
    const now = Date.now()
    await ctx.db.patch(job._id, {
      status: "failed",
      errorCode: args.errorCode.slice(0, 100),
      errorMessage: args.errorMessage.slice(0, 500),
      updatedAt: now,
    })
    await ctx.db.patch(generationSet._id, { status: "failed", updatedAt: now })
    const outputs = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_job_id_and_ordinal", (indexQuery) =>
        indexQuery.eq("generationJobId", job._id)
      )
      .take(4)
    for (const output of outputs) {
      if (output.storageId) await ctx.storage.delete(output.storageId)
      await ctx.db.patch(output._id, {
        status: "failed",
        errorCode: args.errorCode.slice(0, 100),
        storageId: undefined,
        name: undefined,
        contentType: undefined,
        size: undefined,
        width: undefined,
        height: undefined,
        seed: undefined,
        updatedAt: now,
      })
    }
    const message = await ctx.db.get(generationSet.assistantMessageId)
    if (
      message &&
      (message.status === "pending" || message.status === "streaming")
    )
      await ctx.db.patch(message._id, {
        content: "",
        ...(args.errorCode === "insufficient_credits"
          ? { errorCode: "insufficient_credits" as const }
          : { errorCode: undefined }),
        status: "failed",
        scheduledGenerationId: undefined,
      })
    return null
  },
})

export const listByConversation = query({
  args: { conversationId: v.string() },
  returns: v.array(generationSetViewValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) return []
    const conversation = await ctx.db.get(conversationId)
    if (!conversation || conversation.ownerId !== user._id) return []
    const generationSets = await ctx.db
      .query("imageGenerationSets")
      .withIndex("by_conversation_id_and_created_at", (indexQuery) =>
        indexQuery.eq("conversationId", conversation._id)
      )
      .order("desc")
      .take(MAX_GENERATION_SETS)
    return await Promise.all(
      generationSets.reverse().map(async (generationSet) => {
        const outputs = await ctx.db
          .query("imageGenerationOutputs")
          .withIndex("by_generation_set_id_and_ordinal", (indexQuery) =>
            indexQuery.eq("generationSetId", generationSet._id)
          )
          .order("asc")
          .take(4)
        return {
          _id: generationSet._id,
          assistantMessageId: generationSet.assistantMessageId,
          prompt: generationSet.prompt,
          provider: generationSet.provider,
          model: generationSet.model,
          ...(generationSet.endpoint
            ? { endpoint: generationSet.endpoint }
            : {}),
          config: generationSet.config,
          capabilityRevision: generationSet.capabilityRevision,
          requestedMinimum: generationSet.requestedMinimum,
          requestedMaximum: generationSet.requestedMaximum,
          pricingKind: generationSet.pricingKind,
          ...(generationSet.pricingDisplay
            ? { pricingDisplay: generationSet.pricingDisplay }
            : {}),
          status: generationSet.status,
          createdAt: generationSet.createdAt,
          updatedAt: generationSet.updatedAt,
          outputs: await Promise.all(
            outputs.map(async (output) => {
              const url = output.storageId
                ? await ctx.storage.getUrl(output.storageId)
                : null
              return {
                _id: output._id,
                ordinal: output.ordinal,
                status: output.status,
                ...(output.name ? { name: output.name } : {}),
                ...(output.contentType
                  ? { contentType: output.contentType }
                  : {}),
                ...(output.size === undefined ? {} : { size: output.size }),
                ...(output.width === undefined ? {} : { width: output.width }),
                ...(output.height === undefined
                  ? {}
                  : { height: output.height }),
                ...(output.seed === undefined ? {} : { seed: output.seed }),
                ...(output.errorCode ? { errorCode: output.errorCode } : {}),
                ...(url ? { url } : {}),
              }
            })
          ),
        }
      })
    )
  },
})

export const cancel = mutation({
  args: { generationSetId: v.id("imageGenerationSets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const generationSet = await getOwnedGenerationSet(
      ctx,
      args.generationSetId,
      user._id
    )
    if (!["queued", "running"].includes(generationSet.status)) return null
    const job = await getLatestJob(ctx, generationSet._id)
    const message = await ctx.db.get(generationSet.assistantMessageId)
    if (
      !message ||
      (message.status !== "pending" && message.status !== "streaming")
    )
      return null
    const now = Date.now()
    await ctx.db.patch(generationSet._id, {
      status: "canceled",
      updatedAt: now,
    })
    if (job)
      await ctx.db.patch(job._id, {
        status: "canceled",
        cancellationRequestedAt: now,
        updatedAt: now,
      })
    const outputs = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_set_id_and_ordinal", (indexQuery) =>
        indexQuery.eq("generationSetId", generationSet._id)
      )
      .take(4)
    for (const output of outputs) {
      if (output.storageId) await ctx.storage.delete(output.storageId)
      if (output.status === "queued" || output.status === "running")
        await ctx.db.patch(output._id, {
          status: "canceled",
          storageId: undefined,
          name: undefined,
          contentType: undefined,
          size: undefined,
          width: undefined,
          height: undefined,
          seed: undefined,
          updatedAt: now,
        })
    }
    await ctx.db.patch(message._id, {
      status: "stopped",
      scheduledGenerationId: undefined,
    })
    if (message.scheduledGenerationId)
      try {
        await ctx.scheduler.cancel(message.scheduledGenerationId)
      } catch {
        // The running action observes the canceled generation set before persistence.
      }
    return null
  },
})

export const getRetryContext = internalQuery({
  args: { generationSetId: v.id("imageGenerationSets") },
  returns: v.object({
    capabilityRevision: v.string(),
    config: imageGenerationConfigValidator,
    model: v.string(),
    provider: v.union(
      v.literal("fal"),
      v.literal("openrouter"),
      v.literal("ai_gateway")
    ),
    routingProvider: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const generationSet = await getOwnedGenerationSetForQuery(
      ctx,
      args.generationSetId,
      user._id
    )
    const message = await ctx.db.get(generationSet.assistantMessageId)
    if (
      !["failed", "canceled"].includes(generationSet.status) ||
      !message ||
      !["failed", "stopped"].includes(message.status)
    )
      throw new Error("This generation is not retryable")
    return {
      capabilityRevision: generationSet.capabilityRevision,
      config: generationSet.config,
      model: generationSet.model,
      provider: generationSet.provider,
      ...(generationSet.endpoint
        ? { routingProvider: generationSet.endpoint }
        : {}),
    }
  },
})

export const requeue = internalMutation({
  args: { generationSetId: v.id("imageGenerationSets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const generationSet = await getOwnedGenerationSet(
      ctx,
      args.generationSetId,
      user._id
    )
    if (!["failed", "canceled"].includes(generationSet.status))
      throw new Error("This generation is not retryable")
    const message = await ctx.db.get(generationSet.assistantMessageId)
    const conversation = await ctx.db.get(generationSet.conversationId)
    const connection = await ctx.db.get(generationSet.providerConnectionId)
    if (
      !message ||
      !conversation ||
      !connection ||
      connection.ownerId !== user._id ||
      connection.status !== "connected" ||
      connection.provider !== generationSet.provider ||
      conversation.status !== "active" ||
      !["failed", "stopped"].includes(message.status)
    )
      throw new Error("This generation is not retryable")
    const previousJob = await getLatestJob(ctx, generationSet._id)
    if (!previousJob) throw new Error("Image generation job is unavailable")
    if (previousJob.attempt >= MAX_GENERATION_ATTEMPTS)
      throw new Error("This generation has reached its retry limit")
    const activeMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (indexQuery) =>
        indexQuery.eq("conversationId", conversation._id)
      )
      .filter((queryBuilder) =>
        queryBuilder.or(
          queryBuilder.eq(queryBuilder.field("status"), "pending"),
          queryBuilder.eq(queryBuilder.field("status"), "streaming")
        )
      )
      .take(2)
    if (activeMessages.some((active) => active._id !== message._id))
      throw new Error("Wait for the current generation to finish")
    const now = Date.now()
    const generationJobId = await ctx.db.insert("imageGenerationJobs", {
      generationSetId: generationSet._id,
      attempt: previousJob.attempt + 1,
      requestedOutputs: generationSet.requestedMaximum,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    })
    const outputs = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_set_id_and_ordinal", (indexQuery) =>
        indexQuery.eq("generationSetId", generationSet._id)
      )
      .take(4)
    for (const output of outputs) {
      if (output.storageId && !output.libraryAssetId)
        await ctx.storage.delete(output.storageId)
      await ctx.db.patch(output._id, {
        generationJobId,
        status: "queued",
        errorCode: undefined,
        storageId: undefined,
        libraryAssetId: undefined,
        name: undefined,
        contentType: undefined,
        size: undefined,
        width: undefined,
        height: undefined,
        seed: undefined,
        updatedAt: now,
      })
    }
    await ctx.db.patch(generationSet._id, { status: "queued", updatedAt: now })
    await ctx.db.patch(message._id, {
      status: "pending",
      errorCode: undefined,
      content: "",
    })
    const scheduledGenerationId = await ctx.scheduler.runAfter(
      0,
      internal.openRouterResponses.generate,
      {
        assistantMessageId: message._id,
        conversationId: conversation._id,
        imageGenerationJobId: generationJobId,
      }
    )
    await ctx.db.patch(message._id, { scheduledGenerationId })
    return null
  },
})
