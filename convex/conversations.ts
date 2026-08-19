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
import { messageAttachmentValidator } from "./attachmentPolicy"
import { consumeDraftAttachments } from "./attachments"
import { indexMessageAttachments, removeMessageAssets } from "./library"
import { getMemorySearchScopes } from "./memories"
import { isIndexableProjectSource } from "./projectEmbeddingPolicy"
import { buildProjectSourceContext, buildSystemPrompt } from "./systemPrompt"
import { terminalRunValidator } from "./terminalPolicy"
import { MAX_GENERATIVE_UI_PAYLOAD_LENGTH } from "../shared/generative-ui"
import {
  createFallbackChatTitle,
  isValidGeneratedChatTitle,
} from "../shared/chat-title"

const MAX_CONVERSATIONS = 30
const MAX_WORKSPACE_HISTORY_ROWS_READ = 300
const MAX_MESSAGES = 200
const MAX_PROJECT_SOURCES = 8
const MAX_ALWAYS_INCLUDED_MEMORIES = 20
const MAX_MESSAGE_LENGTH = 32_000
const MAX_MODEL_LENGTH = 200
const REASONING_EFFORTS = new Set([
  "ultra",
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
])
const outputModeValidator = v.union(v.literal("image"), v.literal("text"))
const responseProviderValidator = v.union(
  v.literal("openrouter"),
  v.literal("openai"),
  v.literal("fal")
)
const IMAGE_PROVIDERS = new Set(["openrouter", "fal"])
const memoryModeValidator = v.union(
  v.literal("standard"),
  v.literal("read_only"),
  v.literal("off")
)

const conversationValidator = v.object({
  _id: v.id("conversations"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  projectId: v.optional(v.id("projects")),
  title: v.string(),
  titleGenerationStatus: v.optional(
    v.union(v.literal("pending"), v.literal("generated"))
  ),
  titleSourceMessageId: v.optional(v.id("messages")),
  status: v.union(v.literal("active"), v.literal("archived")),
  providerConnectionId: v.optional(v.id("providerConnections")),
  model: v.optional(v.string()),
  outputMode: v.optional(outputModeValidator),
  routingProvider: v.optional(v.string()),
  reasoningEffort: v.optional(v.string()),
  memoryMode: v.optional(memoryModeValidator),
  activeBranchId: v.optional(v.id("conversationBranches")),
  updatedAt: v.number(),
})

const messageBranchNavigationValidator = v.object({
  branchId: v.id("conversationBranches"),
  index: v.number(),
  total: v.number(),
  previousBranchId: v.optional(v.id("conversationBranches")),
  nextBranchId: v.optional(v.id("conversationBranches")),
})

const workspaceHistoryResultValidator = v.object({
  conversations: v.array(conversationValidator),
  isPartial: v.boolean(),
})

const messageValidator = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  conversationId: v.id("conversations"),
  role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
  content: v.string(),
  attachments: v.optional(v.array(messageAttachmentValidator)),
  status: v.union(
    v.literal("pending"),
    v.literal("streaming"),
    v.literal("complete"),
    v.literal("failed"),
    v.literal("stopped")
  ),
  branchId: v.optional(v.id("conversationBranches")),
  provider: v.optional(v.string()),
  model: v.optional(v.string()),
  outputMode: v.optional(outputModeValidator),
  routingProvider: v.optional(v.string()),
  reasoningEffort: v.optional(v.string()),
  reasoningSteps: v.optional(v.array(v.string())),
  contextTokens: v.optional(v.number()),
  terminalRuns: v.optional(v.array(terminalRunValidator)),
  uiPayload: v.optional(v.string()),
  errorCode: v.optional(v.literal("insufficient_credits")),
  scheduledGenerationId: v.optional(v.id("_scheduled_functions")),
  generationSetId: v.optional(v.id("imageGenerationSets")),
})

const clientMessageValidator = messageValidator.extend({
  attachments: v.array(messageAttachmentValidator.extend({ url: v.string() })),
  branchNavigation: v.optional(messageBranchNavigationValidator),
})

const optionalModelSettingsValidator = v.optional(
  v.object({
    model: v.string(),
    reasoningEffort: v.optional(v.string()),
    routingProvider: v.optional(v.string()),
  })
)

type Conversation = Doc<"conversations">
type Message = Doc<"messages">
type Branch = Doc<"conversationBranches">
type DatabaseReader = Pick<QueryCtx, "db">

function normalizeMessage(content: string) {
  const message = content.trim()
  if (!message) throw new Error("Message is required")
  if (message.length > MAX_MESSAGE_LENGTH)
    throw new Error("Message is too long")
  return message
}

function normalizeModel(model: string) {
  const normalized = model.trim()
  if (!normalized || normalized.length > MAX_MODEL_LENGTH)
    throw new Error("Model is unavailable")
  return normalized
}

function normalizeReasoningEffort(effort?: string) {
  if (effort === undefined) return undefined
  if (!REASONING_EFFORTS.has(effort))
    throw new Error("Reasoning effort is unavailable")
  return effort
}

function normalizeRoutingProvider(value: string | undefined, provider: string) {
  if (value === undefined) return undefined
  if (
    provider !== "openrouter" ||
    value.length > 100 ||
    !/^(auto|[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)$/.test(value)
  ) {
    throw new Error("Model provider is unavailable")
  }
  return value
}

async function getOwnedConversation(
  ctx: MutationCtx,
  userId: Id<"users">,
  conversationIdArg: string
) {
  const conversationId = ctx.db.normalizeId("conversations", conversationIdArg)
  if (!conversationId) throw new Error("Conversation unavailable")
  const conversation = await ctx.db.get(conversationId)
  if (!conversation || conversation.ownerId !== userId)
    throw new Error("Conversation unavailable")
  return conversation
}

async function getConversationMessages(
  ctx: DatabaseReader,
  conversationId: Id<"conversations">
) {
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_conversation", (indexQuery) =>
      indexQuery.eq("conversationId", conversationId)
    )
    .order("asc")
    .take(MAX_MESSAGES + 1)
  if (messages.length > MAX_MESSAGES)
    throw new Error("Conversation has reached its message limit")
  return messages
}

async function getBranchChain(
  ctx: DatabaseReader,
  conversationId: Id<"conversations">,
  branchId: Id<"conversationBranches">
) {
  const reversed: Branch[] = []
  let currentId: Id<"conversationBranches"> | undefined = branchId
  while (currentId) {
    if (reversed.length >= MAX_MESSAGES)
      throw new Error("Conversation branch depth is unavailable")
    const branch: Branch | null = await ctx.db.get(currentId)
    if (!branch || branch.conversationId !== conversationId)
      throw new Error("Conversation branch unavailable")
    reversed.push(branch)
    currentId = branch.parentBranchId
  }
  return reversed.reverse()
}

async function resolveBranchTranscript(
  ctx: DatabaseReader,
  conversation: Conversation,
  targetBranchId = conversation.activeBranchId
) {
  const messages = await getConversationMessages(ctx, conversation._id)
  if (!targetBranchId)
    return messages.filter((message) => message.branchId === undefined)

  const chain = await getBranchChain(ctx, conversation._id, targetBranchId)
  let transcript: Message[] = []
  for (const [index, branch] of chain.entries()) {
    if (index === 0) {
      transcript = messages.filter(
        (message) =>
          message.branchId === undefined || message.branchId === branch._id
      )
      continue
    }
    const anchorIndex = branch.forkedAfterMessageId
      ? transcript.findIndex(
          (message) => message._id === branch.forkedAfterMessageId
        )
      : -1
    if (branch.forkedAfterMessageId && anchorIndex < 0)
      throw new Error("Conversation branch anchor unavailable")
    transcript = [
      ...transcript.slice(0, anchorIndex + 1),
      ...messages.filter((message) => message.branchId === branch._id),
    ]
  }
  return transcript
}

async function ensureRootBranch(
  ctx: MutationCtx,
  conversation: Conversation,
  messages: Message[]
) {
  if (conversation.activeBranchId) {
    const branch = await ctx.db.get(conversation.activeBranchId)
    if (!branch || branch.conversationId !== conversation._id)
      throw new Error("Conversation branch unavailable")
    return branch
  }
  const branchId = await ctx.db.insert("conversationBranches", {
    conversationId: conversation._id,
    ...(messages.at(-1) ? { lastMessageId: messages.at(-1)?._id } : {}),
    createdAt: Date.now(),
  })
  await ctx.db.patch(conversation._id, { activeBranchId: branchId })
  const branch = await ctx.db.get(branchId)
  if (!branch) throw new Error("Conversation branch unavailable")
  return branch
}

function assertExpectedActiveBranch(
  conversation: Conversation,
  expectedActiveBranchId?: Id<"conversationBranches">
) {
  if (conversation.activeBranchId !== expectedActiveBranchId)
    throw new Error("Conversation changed in another tab")
}

function assertNoActiveGeneration(messages: Message[]) {
  if (
    messages.some(
      (message) =>
        message.role === "assistant" &&
        (message.status === "pending" || message.status === "streaming")
    )
  )
    throw new Error("Wait for the current response to finish")
}

async function scheduleGeneration(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  assistantMessageId: Id<"messages">,
  provider: string
) {
  if (provider === "codex") return
  const scheduledGenerationId = await ctx.scheduler.runAfter(
    0,
    internal.openRouterResponses.generate,
    { assistantMessageId, conversationId }
  )
  await ctx.db.patch(assistantMessageId, { scheduledGenerationId })
}

function closeRunningTerminalItems(terminalRuns: Message["terminalRuns"]) {
  return terminalRuns?.map((run) =>
    run.status === "running"
      ? { ...run, output: "Stopped by user", status: "failed" as const }
      : run
  )
}

async function getForkLocation(
  ctx: DatabaseReader,
  conversationId: Id<"conversations">,
  rootBranchId: Id<"conversationBranches">,
  message: Message,
  transcript: Message[]
) {
  const messageIndex = transcript.findIndex((item) => item._id === message._id)
  if (messageIndex < 0) throw new Error("Message is not on the active branch")
  const ownBranchId = message.branchId ?? rootBranchId
  const ownBranch = await ctx.db.get(ownBranchId)
  if (!ownBranch || ownBranch.conversationId !== conversationId)
    throw new Error("Conversation branch unavailable")
  const localMessages = transcript.filter(
    (item) => item.branchId === ownBranchId
  )
  if (ownBranch.parentBranchId && localMessages.at(0)?._id === message._id) {
    return {
      forkedAfterMessageId: ownBranch.forkedAfterMessageId,
      parentBranchId: ownBranch.parentBranchId,
    }
  }
  return {
    forkedAfterMessageId:
      messageIndex > 0 ? transcript[messageIndex - 1]._id : undefined,
    parentBranchId: ownBranchId,
  }
}

async function getBranchModelSettings(
  ctx: MutationCtx,
  conversation: Conversation,
  sourceMessage: Message,
  requested?: {
    model: string
    reasoningEffort?: string
    routingProvider?: string
  }
) {
  if (!conversation.providerConnectionId)
    throw new Error("Provider connection unavailable")
  const connection = await ctx.db.get(conversation.providerConnectionId)
  if (
    !connection ||
    connection.ownerId !== conversation.ownerId ||
    connection.status !== "connected" ||
    sourceMessage.provider !== connection.provider
  )
    throw new Error("Provider connection unavailable")
  const model = normalizeModel(requested?.model ?? sourceMessage.model ?? "")
  const reasoningEffort = normalizeReasoningEffort(
    requested ? requested.reasoningEffort : sourceMessage.reasoningEffort
  )
  const routingProvider = normalizeRoutingProvider(
    requested ? requested.routingProvider : sourceMessage.routingProvider,
    connection.provider
  )
  return {
    connection,
    model,
    outputMode: sourceMessage.outputMode ?? conversation.outputMode ?? "text",
    reasoningEffort,
    routingProvider,
  }
}

async function deleteConversationMessages(
  ctx: MutationCtx,
  conversationId: Id<"conversations">
) {
  const messages = await getConversationMessages(ctx, conversationId)
  const attachmentStorageIds = new Set<Id<"_storage">>()
  const generationSets = await ctx.db
    .query("imageGenerationSets")
    .withIndex("by_conversation_id_and_created_at", (indexQuery) =>
      indexQuery.eq("conversationId", conversationId)
    )
    .take(50)
  for (const generationSet of generationSets) {
    const outputs = await ctx.db
      .query("imageGenerationOutputs")
      .withIndex("by_generation_set_id_and_ordinal", (indexQuery) =>
        indexQuery.eq("generationSetId", generationSet._id)
      )
      .take(4)
    for (const output of outputs) {
      if (output.storageId) attachmentStorageIds.add(output.storageId)
      await ctx.db.delete(output._id)
    }
    const jobs = await ctx.db
      .query("imageGenerationJobs")
      .withIndex("by_generation_set_id_and_attempt", (indexQuery) =>
        indexQuery.eq("generationSetId", generationSet._id)
      )
      .take(10)
    for (const job of jobs) await ctx.db.delete(job._id)
    await ctx.db.delete(generationSet._id)
  }
  for (const message of messages) {
    if (
      message.scheduledGenerationId &&
      (message.status === "pending" || message.status === "streaming")
    )
      try {
        await ctx.scheduler.cancel(message.scheduledGenerationId)
      } catch {
        // A running action observes the removed attempt state and exits safely.
      }
    await removeMessageAssets(ctx, message._id)
    for (const attachment of message.attachments ?? [])
      attachmentStorageIds.add(attachment.storageId)
    await ctx.db.delete(message._id)
  }
  for (const storageId of attachmentStorageIds)
    await ctx.storage.delete(storageId)
  const branches = await ctx.db
    .query("conversationBranches")
    .withIndex("by_conversation", (indexQuery) =>
      indexQuery.eq("conversationId", conversationId)
    )
    .take(MAX_MESSAGES)
  for (const branch of branches) await ctx.db.delete(branch._id)
}

async function getTitleSourceMessage(
  ctx: Pick<QueryCtx, "db">,
  conversation: {
    _id: Id<"conversations">
    titleSourceMessageId?: Id<"messages">
  }
) {
  if (!conversation.titleSourceMessageId) return null
  const message = await ctx.db.get(conversation.titleSourceMessageId)
  return message?.conversationId === conversation._id &&
    message.role === "user" &&
    message.status === "complete"
    ? message
    : null
}

async function applyGeneratedTitle(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
  title: string
) {
  if (!isValidGeneratedChatTitle(title)) return
  const conversation = await ctx.db.get(conversationId)
  if (!conversation || conversation.titleGenerationStatus !== "pending") return
  const initialUserMessage = await getTitleSourceMessage(ctx, conversation)
  if (
    !initialUserMessage ||
    conversation.title !== createFallbackChatTitle(initialUserMessage.content)
  )
    return
  await ctx.db.patch(conversationId, {
    title,
    titleGenerationStatus: "generated",
  })
}

export const start = mutation({
  args: {
    content: v.string(),
    draftAttachmentIds: v.optional(v.array(v.id("draftAttachments"))),
    model: v.string(),
    outputMode: v.optional(outputModeValidator),
    projectId: v.optional(v.string()),
    providerConnectionId: v.id("providerConnections"),
    reasoningEffort: v.optional(v.string()),
    routingProvider: v.optional(v.string()),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const content = normalizeMessage(args.content)
    const model = normalizeModel(args.model)
    const reasoningEffort = normalizeReasoningEffort(args.reasoningEffort)

    const connection = await ctx.db.get(args.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== user._id ||
      !["openrouter", "openai", "fal", "codex"].includes(connection.provider) ||
      connection.status !== "connected"
    )
      throw new Error("Provider connection unavailable")
    const routingProvider = normalizeRoutingProvider(
      args.routingProvider,
      connection.provider
    )
    const outputMode = args.outputMode ?? "text"
    if (outputMode === "image" && !IMAGE_PROVIDERS.has(connection.provider))
      throw new Error("Image generation requires OpenRouter or Fal")
    if (outputMode === "text" && connection.provider === "fal")
      throw new Error("Fal is available for image generation only")

    const projectId = args.projectId
      ? ctx.db.normalizeId("projects", args.projectId)
      : null
    if (args.projectId && !projectId) throw new Error("Project unavailable")
    if (projectId) {
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== user._id)
        throw new Error("Project unavailable")
    }
    const attachments = await consumeDraftAttachments(
      ctx,
      user._id,
      args.draftAttachmentIds ?? []
    )

    const now = Date.now()
    const conversationId = await ctx.db.insert("conversations", {
      ownerId: user._id,
      ...(projectId ? { projectId } : {}),
      title: createFallbackChatTitle(content),
      titleGenerationStatus: "pending",
      status: "active",
      providerConnectionId: connection._id,
      model,
      outputMode,
      ...(routingProvider ? { routingProvider } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
      updatedAt: now,
    })
    const rootBranchId = await ctx.db.insert("conversationBranches", {
      conversationId,
      createdAt: now,
    })
    await ctx.db.patch(conversationId, { activeBranchId: rootBranchId })
    const initialUserMessageId = await ctx.db.insert("messages", {
      conversationId,
      branchId: rootBranchId,
      role: "user",
      content,
      ...(attachments.length ? { attachments } : {}),
      status: "complete",
      provider: connection.provider,
      model,
      outputMode,
      ...(routingProvider ? { routingProvider } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    })
    await indexMessageAttachments(ctx, {
      ownerId: user._id,
      conversationId,
      messageId: initialUserMessageId,
      role: "user",
      attachments,
      createdAt: now,
    })
    await ctx.db.patch(conversationId, {
      titleSourceMessageId: initialUserMessageId,
    })
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId,
      branchId: rootBranchId,
      role: "assistant",
      content: "",
      status: "pending",
      provider: connection.provider,
      model,
      outputMode,
      ...(routingProvider ? { routingProvider } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    })
    await ctx.db.patch(rootBranchId, { lastMessageId: assistantMessageId })
    await ctx.scheduler.runAfter(0, internal.memoryCapture.enqueueForMessage, {
      conversationId,
      messageId: initialUserMessageId,
      ownerId: user._id,
    })
    if (["openrouter", "openai"].includes(connection.provider)) {
      await ctx.scheduler.runAfter(
        0,
        internal.openRouterResponses.generateTitle,
        { conversationId }
      )
    }
    await scheduleGeneration(
      ctx,
      conversationId,
      assistantMessageId,
      connection.provider
    )

    return conversationId
  },
})

// Voice sessions begin before a user transcript exists. Create the owned chat
// first so every finalized transcript and memory operation has one stable
// conversation scope from the beginning.
export const startRealtime = mutation({
  args: { projectId: v.optional(v.string()) },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const projectId = args.projectId
      ? ctx.db.normalizeId("projects", args.projectId)
      : null
    if (args.projectId && !projectId) throw new Error("Project unavailable")
    if (projectId) {
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== user._id)
        throw new Error("Project unavailable")
    }
    const openAiConnection = (
      await ctx.db
        .query("providerConnections")
        .withIndex("by_owner_provider", (q) =>
          q.eq("ownerId", user._id).eq("provider", "openai")
        )
        .take(10)
    ).find((connection) => connection.status === "connected")
    if (!openAiConnection)
      throw new Error("Connect OpenAI before starting voice")
    const conversationId = await ctx.db.insert("conversations", {
      ownerId: user._id,
      ...(projectId ? { projectId } : {}),
      title: "Voice conversation",
      status: "active",
      providerConnectionId: openAiConnection._id,
      model: "gpt-4o-mini",
      outputMode: "text",
      updatedAt: Date.now(),
    })
    const rootBranchId = await ctx.db.insert("conversationBranches", {
      conversationId,
      createdAt: Date.now(),
    })
    await ctx.db.patch(conversationId, { activeBranchId: rootBranchId })
    return conversationId
  },
})

export const send = mutation({
  args: {
    conversationId: v.string(),
    content: v.string(),
    draftAttachmentIds: v.optional(v.array(v.id("draftAttachments"))),
    model: v.string(),
    reasoningEffort: v.optional(v.string()),
    routingProvider: v.optional(v.string()),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const content = normalizeMessage(args.content)
    const model = normalizeModel(args.model)
    const reasoningEffort = normalizeReasoningEffort(args.reasoningEffort)
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) throw new Error("Conversation unavailable")

    const conversation = await ctx.db.get(conversationId)
    if (
      !conversation ||
      conversation.ownerId !== user._id ||
      conversation.status !== "active" ||
      !conversation.providerConnectionId ||
      !conversation.model
    )
      throw new Error("Conversation unavailable")

    const connection = await ctx.db.get(conversation.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== user._id ||
      !["openrouter", "openai", "fal", "codex"].includes(connection.provider) ||
      connection.status !== "connected"
    )
      throw new Error("Provider connection unavailable")
    const routingProvider = normalizeRoutingProvider(
      args.routingProvider,
      connection.provider
    )
    const outputMode = conversation.outputMode ?? "text"
    if (outputMode === "image" && !IMAGE_PROVIDERS.has(connection.provider))
      throw new Error("Image generation requires OpenRouter or Fal")
    if (outputMode === "text" && connection.provider === "fal")
      throw new Error("Fal is available for image generation only")

    const existingMessages = await getConversationMessages(ctx, conversationId)
    assertNoActiveGeneration(existingMessages)
    if (existingMessages.length > MAX_MESSAGES - 2)
      throw new Error("Conversation has reached its message limit")
    const attachments = await consumeDraftAttachments(
      ctx,
      user._id,
      args.draftAttachmentIds ?? []
    )

    const now = Date.now()
    const activeBranch = await ensureRootBranch(
      ctx,
      conversation,
      existingMessages
    )
    const messageId = await ctx.db.insert("messages", {
      conversationId,
      branchId: activeBranch._id,
      role: "user",
      content,
      ...(attachments.length ? { attachments } : {}),
      status: "complete",
      provider: connection.provider,
      model,
      outputMode,
      ...(routingProvider ? { routingProvider } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    })
    await indexMessageAttachments(ctx, {
      ownerId: user._id,
      conversationId,
      messageId,
      role: "user",
      attachments,
      createdAt: now,
    })
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId,
      branchId: activeBranch._id,
      role: "assistant",
      content: "",
      status: "pending",
      provider: connection.provider,
      model,
      outputMode,
      ...(routingProvider ? { routingProvider } : {}),
      ...(reasoningEffort ? { reasoningEffort } : {}),
    })
    await ctx.db.patch(activeBranch._id, {
      lastMessageId: assistantMessageId,
    })
    await ctx.db.patch(conversationId, {
      model,
      routingProvider,
      reasoningEffort,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.memoryCapture.enqueueForMessage, {
      conversationId,
      messageId,
      ownerId: user._id,
    })
    await scheduleGeneration(
      ctx,
      conversationId,
      assistantMessageId,
      connection.provider
    )
    return messageId
  },
})

export const stopResponse = mutation({
  args: {
    assistantMessageId: v.id("messages"),
    conversationId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    const message = await ctx.db.get(args.assistantMessageId)
    if (
      !message ||
      message.conversationId !== conversation._id ||
      message.role !== "assistant"
    )
      throw new Error("Response unavailable")
    const transcript = await resolveBranchTranscript(ctx, conversation)
    if (!transcript.some((item) => item._id === message._id))
      throw new Error("Response unavailable")
    if (message.status === "stopped") return null
    if (message.status !== "pending" && message.status !== "streaming")
      throw new Error("Response is no longer running")

    await ctx.db.patch(message._id, {
      scheduledGenerationId: undefined,
      status: "stopped",
      terminalRuns: closeRunningTerminalItems(message.terminalRuns),
    })
    await ctx.db.patch(conversation._id, { updatedAt: Date.now() })
    if (message.scheduledGenerationId) {
      try {
        await ctx.scheduler.cancel(message.scheduledGenerationId)
      } catch {
        // A running action cooperatively observes the stopped message state.
      }
    }
    return null
  },
})

export const retryResponse = mutation({
  args: {
    assistantMessageId: v.id("messages"),
    conversationId: v.string(),
    expectedActiveBranchId: v.optional(v.id("conversationBranches")),
    modelSettings: optionalModelSettingsValidator,
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (conversation.status !== "active")
      throw new Error("Conversation unavailable")
    assertExpectedActiveBranch(conversation, args.expectedActiveBranchId)
    const allMessages = await getConversationMessages(ctx, conversation._id)
    assertNoActiveGeneration(allMessages)
    if (allMessages.length >= MAX_MESSAGES)
      throw new Error("Conversation has reached its message limit")
    const transcript = await resolveBranchTranscript(ctx, conversation)
    const source = transcript.find(
      (message) => message._id === args.assistantMessageId
    )
    if (
      !source ||
      source.role !== "assistant" ||
      !["complete", "failed", "stopped"].includes(source.status)
    )
      throw new Error("Response unavailable")
    const sourceIndex = transcript.findIndex(
      (message) => message._id === source._id
    )
    const userMessage = transcript
      .slice(0, sourceIndex)
      .findLast(
        (message) => message.role === "user" && message.status === "complete"
      )
    if (!userMessage) throw new Error("Prompt unavailable")
    const rootBranch = await ensureRootBranch(ctx, conversation, allMessages)
    const fork = await getForkLocation(
      ctx,
      conversation._id,
      rootBranch._id,
      source,
      transcript
    )
    const settings = await getBranchModelSettings(
      ctx,
      conversation,
      source,
      args.modelSettings
    )
    const now = Date.now()
    const branchId = await ctx.db.insert("conversationBranches", {
      conversationId: conversation._id,
      parentBranchId: fork.parentBranchId,
      forkedAfterMessageId: userMessage._id,
      createdAt: now,
    })
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      branchId,
      role: "assistant",
      content: "",
      status: "pending",
      provider: settings.connection.provider,
      model: settings.model,
      outputMode: settings.outputMode,
      ...(settings.routingProvider
        ? { routingProvider: settings.routingProvider }
        : {}),
      ...(settings.reasoningEffort
        ? { reasoningEffort: settings.reasoningEffort }
        : {}),
    })
    await ctx.db.patch(branchId, { lastMessageId: assistantMessageId })
    await ctx.db.patch(conversation._id, {
      activeBranchId: branchId,
      model: settings.model,
      routingProvider: settings.routingProvider,
      reasoningEffort: settings.reasoningEffort,
      updatedAt: now,
    })
    await scheduleGeneration(
      ctx,
      conversation._id,
      assistantMessageId,
      settings.connection.provider
    )
    return assistantMessageId
  },
})

export const editUserMessage = mutation({
  args: {
    content: v.string(),
    conversationId: v.string(),
    expectedActiveBranchId: v.optional(v.id("conversationBranches")),
    modelSettings: optionalModelSettingsValidator,
    userMessageId: v.id("messages"),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (conversation.status !== "active")
      throw new Error("Conversation unavailable")
    assertExpectedActiveBranch(conversation, args.expectedActiveBranchId)
    const allMessages = await getConversationMessages(ctx, conversation._id)
    assertNoActiveGeneration(allMessages)
    if (allMessages.length > MAX_MESSAGES - 2)
      throw new Error("Conversation has reached its message limit")
    const transcript = await resolveBranchTranscript(ctx, conversation)
    const source = transcript.find(
      (message) => message._id === args.userMessageId
    )
    if (!source || source.role !== "user" || source.status !== "complete")
      throw new Error("Prompt unavailable")
    const sourceIndex = transcript.findIndex(
      (message) => message._id === source._id
    )
    const previousMessage =
      sourceIndex > 0 ? transcript[sourceIndex - 1] : undefined
    const rootBranch = await ensureRootBranch(ctx, conversation, allMessages)
    const fork = await getForkLocation(
      ctx,
      conversation._id,
      rootBranch._id,
      source,
      transcript
    )
    const settings = await getBranchModelSettings(
      ctx,
      conversation,
      source,
      args.modelSettings
    )
    const content = normalizeMessage(args.content)
    const now = Date.now()
    const branchId = await ctx.db.insert("conversationBranches", {
      conversationId: conversation._id,
      parentBranchId: fork.parentBranchId,
      ...(previousMessage ? { forkedAfterMessageId: previousMessage._id } : {}),
      createdAt: now,
    })
    const userMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      branchId,
      role: "user",
      content,
      ...(source.attachments?.length
        ? { attachments: source.attachments }
        : {}),
      status: "complete",
      provider: settings.connection.provider,
      model: settings.model,
      outputMode: settings.outputMode,
      ...(settings.routingProvider
        ? { routingProvider: settings.routingProvider }
        : {}),
      ...(settings.reasoningEffort
        ? { reasoningEffort: settings.reasoningEffort }
        : {}),
    })
    const assistantMessageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      branchId,
      role: "assistant",
      content: "",
      status: "pending",
      provider: settings.connection.provider,
      model: settings.model,
      outputMode: settings.outputMode,
      ...(settings.routingProvider
        ? { routingProvider: settings.routingProvider }
        : {}),
      ...(settings.reasoningEffort
        ? { reasoningEffort: settings.reasoningEffort }
        : {}),
    })
    await ctx.db.patch(branchId, { lastMessageId: assistantMessageId })
    await ctx.db.patch(conversation._id, {
      activeBranchId: branchId,
      model: settings.model,
      routingProvider: settings.routingProvider,
      reasoningEffort: settings.reasoningEffort,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.memoryCapture.enqueueForMessage, {
      conversationId: conversation._id,
      messageId: userMessageId,
      ownerId: user._id,
    })
    await scheduleGeneration(
      ctx,
      conversation._id,
      assistantMessageId,
      settings.connection.provider
    )
    return userMessageId
  },
})

export const selectBranch = mutation({
  args: {
    branchId: v.id("conversationBranches"),
    conversationId: v.string(),
    expectedActiveBranchId: v.optional(v.id("conversationBranches")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    assertExpectedActiveBranch(conversation, args.expectedActiveBranchId)
    const messages = await getConversationMessages(ctx, conversation._id)
    assertNoActiveGeneration(messages)
    const branch = await ctx.db.get(args.branchId)
    if (!branch || branch.conversationId !== conversation._id)
      throw new Error("Conversation branch unavailable")
    await resolveBranchTranscript(ctx, conversation, branch._id)
    await ctx.db.patch(conversation._id, {
      activeBranchId: branch._id,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const setMemoryMode = mutation({
  args: {
    conversationId: v.string(),
    memoryMode: memoryModeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (conversation.memoryMode !== args.memoryMode)
      await ctx.db.patch(conversation._id, {
        memoryMode: args.memoryMode,
        updatedAt: Date.now(),
      })
    return null
  },
})

async function getPendingDesktopCodexResponse(
  ctx: MutationCtx,
  userId: Id<"users">,
  conversationId: string
) {
  const conversation = await getOwnedConversation(ctx, userId, conversationId)
  if (!conversation.providerConnectionId)
    throw new Error("Conversation unavailable")
  const connection = await ctx.db.get(conversation.providerConnectionId)
  if (
    !connection ||
    connection.ownerId !== userId ||
    connection.provider !== "codex" ||
    connection.status !== "connected"
  )
    throw new Error("Codex connection unavailable")
  const pending = (await resolveBranchTranscript(ctx, conversation)).findLast(
    (message) => message.role === "assistant"
  )
  if (
    !pending ||
    (pending.status !== "pending" &&
      pending.status !== "streaming" &&
      pending.status !== "stopped")
  )
    throw new Error("Codex response is no longer available")
  return { conversation, message: pending }
}

function normalizeDesktopCodexReasoningSteps(steps: string[] | undefined) {
  const normalized = steps?.map((step) => step.trim())
  if (
    normalized &&
    (normalized.length > 20 ||
      normalized.some((step) => !step || step.length > 2_000))
  )
    throw new Error("Codex reasoning summary is invalid")
  return normalized
}

export const streamDesktopCodexResponse = mutation({
  args: {
    conversationId: v.string(),
    content: v.string(),
    reasoningSteps: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.content.length > MAX_MESSAGE_LENGTH)
      throw new Error("Response is too long")
    const user = await getCurrentUser(ctx)
    const { message } = await getPendingDesktopCodexResponse(
      ctx,
      user._id,
      args.conversationId
    )
    if (message.status === "stopped") return null
    const reasoningSteps = normalizeDesktopCodexReasoningSteps(
      args.reasoningSteps
    )
    await ctx.db.patch(message._id, {
      content: args.content,
      ...(reasoningSteps ? { reasoningSteps } : {}),
      status: "streaming",
    })
    return null
  },
})

export const finishDesktopCodexResponse = mutation({
  args: {
    conversationId: v.string(),
    content: v.string(),
    failed: v.boolean(),
    memoryItemIds: v.optional(v.array(v.id("memoryItems"))),
    reasoningSteps: v.optional(v.array(v.string())),
    summaryIds: v.optional(v.array(v.id("conversationMemorySummaries"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const { conversation, message } = await getPendingDesktopCodexResponse(
      ctx,
      user._id,
      args.conversationId
    )
    if (message.status === "stopped") return null
    const content = normalizeMessage(args.content)
    const reasoningSteps = normalizeDesktopCodexReasoningSteps(
      args.reasoningSteps
    )
    await ctx.db.patch(message._id, {
      content,
      ...(reasoningSteps ? { reasoningSteps } : {}),
      status: args.failed ? "failed" : "complete",
    })
    await ctx.db.patch(conversation._id, { updatedAt: Date.now() })
    if (!args.failed)
      await ctx.scheduler.runAfter(
        0,
        internal.memoryHistory.enqueueForAssistantMessage,
        { assistantMessageId: message._id }
      )
    if (!args.failed && (args.memoryItemIds?.length || args.summaryIds?.length))
      await ctx.scheduler.runAfter(
        0,
        internal.memoryContext.recordResponseReferences,
        {
          conversationId: conversation._id,
          memoryItemIds: args.memoryItemIds ?? [],
          ownerId: user._id,
          responseMessageId: message._id,
          summaryIds: args.summaryIds ?? [],
        }
      )
    return null
  },
})

const responseContextValidator = v.object({
  ciphertext: v.string(),
  connectionId: v.id("providerConnections"),
  iv: v.string(),
  messages: v.array(
    v.object({
      attachments: v.array(
        messageAttachmentValidator.extend({ url: v.string() })
      ),
      content: v.string(),
      role: v.union(
        v.literal("system"),
        v.literal("user"),
        v.literal("assistant")
      ),
    })
  ),
  lastUserMessage: v.string(),
  lastUserMessageCreatedAt: v.number(),
  lastUserMessageId: v.id("messages"),
  hasSearchableMemoryFacts: v.boolean(),
  hasProjectLinks: v.boolean(),
  projectSourceFallbackAttachments: v.array(
    messageAttachmentValidator.extend({ url: v.string() })
  ),
  memoryEnabled: v.boolean(),
  memoryKeys: v.array(
    v.object({
      key: v.string(),
      scope: v.union(v.literal("user"), v.literal("project")),
    })
  ),
  memoryOwnerId: v.id("users"),
  memoryPreferences: v.array(v.string()),
  memoryRevision: v.number(),
  memorySearchScopes: v.array(v.string()),
  ownerId: v.id("users"),
  model: v.string(),
  outputMode: outputModeValidator,
  provider: responseProviderValidator,
  routingProvider: v.optional(v.string()),
  projectId: v.optional(v.id("projects")),
  reasoningEffort: v.optional(v.string()),
})

const chatTitleGenerationContextValidator = v.object({
  ciphertext: v.string(),
  connectionId: v.id("providerConnections"),
  initialQuestion: v.string(),
  iv: v.string(),
  provider: v.union(v.literal("openrouter"), v.literal("openai")),
})

export const getChatTitleGenerationContext = internalQuery({
  args: { conversationId: v.id("conversations") },
  returns: v.union(chatTitleGenerationContextValidator, v.null()),
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation?.providerConnectionId) return null
    const connection = await ctx.db.get(conversation.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== conversation.ownerId ||
      !["openrouter", "openai"].includes(connection.provider) ||
      connection.status !== "connected"
    )
      return null
    if (conversation.titleGenerationStatus !== "pending") return null
    const initialUserMessage = await getTitleSourceMessage(ctx, conversation)
    if (
      !initialUserMessage ||
      conversation.title !== createFallbackChatTitle(initialUserMessage.content)
    )
      return null
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (indexQuery) =>
        indexQuery.eq("connectionId", connection._id)
      )
      .unique()
    if (!credential) return null
    return {
      ciphertext: credential.ciphertext,
      connectionId: connection._id,
      initialQuestion: initialUserMessage.content,
      iv: credential.iv,
      provider: connection.provider as "openrouter" | "openai",
    }
  },
})

const desktopCodexProjectSourceRequestValidator = v.object({
  ownerId: v.id("users"),
  projectId: v.id("projects"),
  query: v.string(),
})

const desktopCodexMemoryContextRequestValidator = v.object({
  conversationId: v.id("conversations"),
  currentMessageId: v.id("messages"),
  ownerId: v.id("users"),
})

export const getDesktopCodexMemoryContextRequest = internalQuery({
  args: { conversationId: v.string() },
  returns: v.union(desktopCodexMemoryContextRequestValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) return null
    const conversation = await ctx.db.get(conversationId)
    if (!conversation?.providerConnectionId) return null
    const [owner, connection] = await Promise.all([
      ctx.db.get(conversation.ownerId),
      ctx.db.get(conversation.providerConnectionId),
    ])
    if (
      !owner ||
      owner.tokenIdentifier !== identity.tokenIdentifier ||
      !connection ||
      connection.ownerId !== owner._id ||
      connection.provider !== "codex" ||
      connection.status !== "connected"
    )
      return null
    const lastUserMessage = (await resolveBranchTranscript(ctx, conversation))
      .reverse()
      .find(
        (message) => message.role === "user" && message.status === "complete"
      )
    if (!lastUserMessage) return null
    return {
      conversationId: conversation._id,
      currentMessageId: lastUserMessage._id,
      ownerId: owner._id,
    }
  },
})

const realtimeMemoryContextRequestValidator = v.object({
  conversationId: v.id("conversations"),
  currentMessageId: v.optional(v.id("messages")),
  ownerId: v.id("users"),
})

export const getRealtimeMemoryContextRequest = internalQuery({
  args: { conversationId: v.string() },
  returns: v.union(realtimeMemoryContextRequestValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) return null
    const conversation = await ctx.db.get(conversationId)
    const owner = conversation ? await ctx.db.get(conversation.ownerId) : null
    if (
      !conversation ||
      conversation.status !== "active" ||
      !owner ||
      owner.tokenIdentifier !== identity.tokenIdentifier
    )
      return null
    const lastUserMessage = (await resolveBranchTranscript(ctx, conversation))
      .reverse()
      .find(
        (message) => message.role === "user" && message.status === "complete"
      )
    return {
      conversationId: conversation._id,
      ownerId: owner._id,
      ...(lastUserMessage ? { currentMessageId: lastUserMessage._id } : {}),
    }
  },
})

export const commitRealtimeTranscript = mutation({
  args: {
    content: v.string(),
    conversationId: v.string(),
    role: v.union(v.literal("assistant"), v.literal("user")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (conversation.status !== "active")
      throw new Error("Conversation unavailable")
    const content = normalizeMessage(args.content)
    const messages = await getConversationMessages(ctx, conversation._id)
    if (messages.length >= MAX_MESSAGES)
      throw new Error("Conversation has reached its message limit")
    const branch = await ensureRootBranch(ctx, conversation, messages)
    const messageId = await ctx.db.insert("messages", {
      branchId: branch._id,
      content,
      conversationId: conversation._id,
      provider: "openai",
      role: args.role,
      status: "complete",
    })
    await ctx.db.patch(branch._id, { lastMessageId: messageId })
    await ctx.db.patch(conversation._id, { updatedAt: Date.now() })
    if (args.role === "user")
      await ctx.scheduler.runAfter(
        0,
        internal.memoryCapture.enqueueForMessage,
        {
          conversationId: conversation._id,
          messageId,
          ownerId: user._id,
        }
      )
    else
      await ctx.scheduler.runAfter(
        0,
        internal.memoryHistory.enqueueForAssistantMessage,
        { assistantMessageId: messageId }
      )
    return null
  },
})

export const getDesktopCodexProjectSourceRequest = internalQuery({
  args: { conversationId: v.string() },
  returns: v.union(desktopCodexProjectSourceRequestValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) return null
    const conversation = await ctx.db.get(conversationId)
    if (!conversation?.projectId) return null
    const [owner, project] = await Promise.all([
      ctx.db.get(conversation.ownerId),
      ctx.db.get(conversation.projectId),
    ])
    if (
      !owner ||
      owner.tokenIdentifier !== identity.tokenIdentifier ||
      !project ||
      project.ownerId !== owner._id
    )
      return null
    const messages = await resolveBranchTranscript(ctx, conversation)
    const lastUserMessage = messages.findLast(
      (message) => message.role === "user" && message.status === "complete"
    )
    if (!lastUserMessage) return null
    return {
      ownerId: owner._id,
      projectId: project._id,
      query: lastUserMessage.content,
    }
  },
})

export const getOpenRouterResponseContext = internalQuery({
  args: {
    assistantMessageId: v.id("messages"),
    conversationId: v.id("conversations"),
  },
  returns: responseContextValidator,
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId)
    const assistantMessage = await ctx.db.get(args.assistantMessageId)
    if (
      !conversation?.providerConnectionId ||
      conversation.status !== "active" ||
      !assistantMessage ||
      assistantMessage.conversationId !== conversation._id ||
      assistantMessage.role !== "assistant" ||
      assistantMessage.status !== "pending" ||
      !assistantMessage.model
    ) {
      throw new Error("Response request unavailable")
    }

    const connection = await ctx.db.get(conversation.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== conversation.ownerId ||
      !["openrouter", "openai", "fal"].includes(connection.provider) ||
      connection.status !== "connected"
    ) {
      throw new Error("Provider connection unavailable")
    }
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (indexQuery) =>
        indexQuery.eq("connectionId", connection._id)
      )
      .unique()
    if (!credential) throw new Error("Provider credential unavailable")

    const recentMessages = await resolveBranchTranscript(
      ctx,
      conversation,
      assistantMessage.branchId ?? conversation.activeBranchId
    )
    const responseIndex = recentMessages.findIndex(
      (message) => message._id === assistantMessage._id
    )
    if (responseIndex < 0) throw new Error("Response request unavailable")

    const owner = await ctx.db.get(conversation.ownerId)
    if (!owner) throw new Error("Conversation owner unavailable")
    const project = conversation.projectId
      ? await ctx.db.get(conversation.projectId)
      : null
    if (
      conversation.projectId &&
      (!project || project.ownerId !== conversation.ownerId)
    )
      throw new Error("Project unavailable")
    const projectSources = project
      ? await ctx.db
          .query("projectSources")
          .withIndex("by_project_id_and_created_at", (indexQuery) =>
            indexQuery.eq("projectId", project._id)
          )
          .order("asc")
          .take(MAX_PROJECT_SOURCES)
      : []
    const projectLinks = projectSources.flatMap((source) =>
      source.kind === "link" ? [source.url] : []
    )
    const projectFileNames = projectSources.flatMap((source) =>
      source.kind === "file" ? [source.name] : []
    )
    const indexedProjectSourceIds = new Set<Id<"projectSources">>()
    if (project?.embeddingProfileId)
      for (const source of projectSources) {
        if (
          source.kind !== "file" ||
          !isIndexableProjectSource(source.contentType, source.name)
        )
          continue
        const states = await ctx.db
          .query("projectSourceIndexStates")
          .withIndex("by_source_id_and_updated_at", (indexQuery) =>
            indexQuery.eq("sourceId", source._id)
          )
          .order("desc")
          .take(20)
        const currentState = states.find(
          (state) =>
            state.embeddingProfileId === project.embeddingProfileId &&
            (state.status === "ready" || state.status === "partial")
        )
        if (currentState) indexedProjectSourceIds.add(source._id)
      }
    const projectFiles = await Promise.all(
      projectSources.flatMap((source) =>
        source.kind === "file"
          ? [
              (async () => {
                const url = await ctx.storage.getUrl(source.storageId)
                return url ? { ...source, url } : null
              })(),
            ]
          : []
      )
    )
    const projectSourceFallbackAttachments = projectFiles.flatMap((source) =>
      source && indexedProjectSourceIds.has(source._id)
        ? [
            {
              contentType: source.contentType,
              name: source.name,
              size: source.size,
              storageId: source.storageId,
              url: source.url,
            },
          ]
        : []
    )
    const memoryEnabled = owner.memoryEnabled ?? false
    const includeUserMemory = project?.memoryScope !== "project_only"
    const memoryScopeKeys = [
      ...(includeUserMemory ? ["user"] : []),
      ...(conversation.projectId ? [`project:${conversation.projectId}`] : []),
    ]
    const preferencesByScope = memoryEnabled
      ? await Promise.all(
          memoryScopeKeys.map(
            async (scopeKey) =>
              await ctx.db
                .query("memories")
                .withIndex(
                  "by_owner_id_and_scope_key_and_kind_and_updated_at",
                  (indexQuery) =>
                    indexQuery
                      .eq("ownerId", owner._id)
                      .eq("scopeKey", scopeKey)
                      .eq("kind", "preference")
                )
                .order("desc")
                .take(MAX_ALWAYS_INCLUDED_MEMORIES)
          )
        )
      : []
    const preferencesByKey = new Map()
    for (const memory of [...(preferencesByScope[0] ?? [])].reverse())
      preferencesByKey.set(memory.key, memory)
    for (const memory of [...(preferencesByScope[1] ?? [])].reverse())
      preferencesByKey.set(memory.key, memory)
    const memoryPreferences = [...preferencesByKey.values()]
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_ALWAYS_INCLUDED_MEMORIES)
      .map((memory) => memory.content)
    const memoriesByScope = memoryEnabled
      ? await Promise.all(
          memoryScopeKeys.map(
            async (scopeKey) =>
              await ctx.db
                .query("memories")
                .withIndex("by_owner_id_and_scope_key_and_key", (indexQuery) =>
                  indexQuery.eq("ownerId", owner._id).eq("scopeKey", scopeKey)
                )
                .take(100)
          )
        )
      : []
    const memoryKeys = memoriesByScope
      .flat()
      .map(({ key, scope }) => ({ key, scope }))
    const hasSearchableMemoryFacts = memoriesByScope
      .flat()
      .some(
        (memory) => memory.kind === "fact" && memory.embedding !== undefined
      )
    const messagesBeforeResponse = recentMessages.slice(0, responseIndex)
    const lastUserMessage = messagesBeforeResponse.findLast(
      (message) => message.role === "user" && message.status === "complete"
    )
    if (!lastUserMessage) throw new Error("Response request unavailable")

    return {
      ciphertext: credential.ciphertext,
      connectionId: connection._id,
      iv: credential.iv,
      hasSearchableMemoryFacts,
      hasProjectLinks: projectLinks.length > 0,
      projectSourceFallbackAttachments,
      lastUserMessage: lastUserMessage.content,
      lastUserMessageCreatedAt: lastUserMessage._creationTime,
      lastUserMessageId: lastUserMessage._id,
      memoryEnabled,
      memoryKeys,
      memoryOwnerId: owner._id,
      memoryPreferences,
      memoryRevision: owner.memoryRevision ?? 0,
      memorySearchScopes: getMemorySearchScopes(
        owner._id,
        conversation.projectId,
        includeUserMemory
      ),
      ownerId: owner._id,
      messages: [
        {
          attachments: [],
          content: buildSystemPrompt(
            {
              language: owner.language ?? "auto",
              responseDetail: owner.responseDetail ?? "balanced",
            },
            project?.instructions,
            projectFileNames
          ),
          role: "system" as const,
        },
        ...(projectSources.length
          ? [
              {
                attachments: projectFiles.flatMap((source) =>
                  source && !indexedProjectSourceIds.has(source._id)
                    ? [
                        {
                          contentType: source.contentType,
                          name: source.name,
                          size: source.size,
                          storageId: source.storageId,
                          url: source.url,
                        },
                      ]
                    : []
                ),
                content: buildProjectSourceContext(
                  projectFileNames,
                  projectLinks
                ),
                role: "user" as const,
              },
            ]
          : []),
        ...(await Promise.all(
          messagesBeforeResponse
            .filter((message) => message.status === "complete")
            .map(async ({ attachments = [], content, role, uiPayload }) => ({
              attachments: (
                await Promise.all(
                  attachments.map(async (attachment) => {
                    const url = await ctx.storage.getUrl(attachment.storageId)
                    return url ? { ...attachment, url } : null
                  })
                )
              ).filter((attachment) => attachment !== null),
              content: uiPayload
                ? [content, `[Rendered interface]\n${uiPayload}`]
                    .filter(Boolean)
                    .join("\n\n")
                : content,
              role,
            }))
        )),
      ],
      model: assistantMessage.model,
      outputMode:
        assistantMessage.outputMode ?? conversation.outputMode ?? "text",
      provider: connection.provider as "openrouter" | "openai" | "fal",
      ...(assistantMessage.routingProvider
        ? { routingProvider: assistantMessage.routingProvider }
        : {}),
      ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
      ...(assistantMessage.reasoningEffort
        ? { reasoningEffort: assistantMessage.reasoningEffort }
        : {}),
    }
  },
})

export const shouldCancelResponse = internalQuery({
  args: { assistantMessageId: v.id("messages") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.assistantMessageId)
    return (
      !message || message.role !== "assistant" || message.status === "stopped"
    )
  },
})

export const setGeneratedTitle = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await applyGeneratedTitle(ctx, args.conversationId, args.title)
    return null
  },
})

export const setDesktopCodexGeneratedTitle = mutation({
  args: {
    conversationId: v.string(),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (!conversation.providerConnectionId) return null
    const connection = await ctx.db.get(conversation.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== user._id ||
      connection.provider !== "codex"
    )
      return null
    await applyGeneratedTitle(ctx, conversation._id, args.title)
    return null
  },
})

export const finishOpenRouterResponse = internalMutation({
  args: {
    assistantMessageId: v.id("messages"),
    content: v.string(),
    errorCode: v.optional(v.literal("insufficient_credits")),
    failed: v.boolean(),
    attachments: v.optional(v.array(messageAttachmentValidator)),
    contextTokens: v.optional(v.number()),
    reasoningSteps: v.optional(v.array(v.string())),
    terminalRuns: v.optional(v.array(terminalRunValidator)),
    uiPayload: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.content.length > MAX_MESSAGE_LENGTH)
      throw new Error("Response is too long")
    if (
      args.contextTokens !== undefined &&
      (!Number.isSafeInteger(args.contextTokens) || args.contextTokens < 0)
    )
      throw new Error("Response context usage is invalid")
    if (
      args.uiPayload &&
      args.uiPayload.length > MAX_GENERATIVE_UI_PAYLOAD_LENGTH
    )
      throw new Error("Generated interface is too large")
    const message = await ctx.db.get(args.assistantMessageId)
    let completed = false
    if (
      message?.role === "assistant" &&
      (message.status === "pending" || message.status === "streaming")
    ) {
      await ctx.db.patch(message._id, {
        content: args.content,
        ...(args.attachments ? { attachments: args.attachments } : {}),
        ...(args.contextTokens === undefined
          ? {}
          : { contextTokens: args.contextTokens }),
        errorCode: args.errorCode,
        ...(args.reasoningSteps ? { reasoningSteps: args.reasoningSteps } : {}),
        ...(args.terminalRuns ? { terminalRuns: args.terminalRuns } : {}),
        ...(args.uiPayload ? { uiPayload: args.uiPayload } : {}),
        status: args.failed ? "failed" : "complete",
      })
      if (!args.failed && args.attachments?.length) {
        const conversation = await ctx.db.get(message.conversationId)
        if (!conversation) throw new Error("Conversation unavailable")
        await indexMessageAttachments(ctx, {
          ownerId: conversation.ownerId,
          conversationId: conversation._id,
          messageId: message._id,
          role: "assistant",
          attachments: args.attachments,
          createdAt: Date.now(),
          outputMode: message.outputMode,
          provider: message.provider,
          model: message.model,
        })
      }
      completed = !args.failed
    }
    if (completed)
      await ctx.scheduler.runAfter(
        0,
        internal.memoryHistory.enqueueForAssistantMessage,
        { assistantMessageId: args.assistantMessageId }
      )
    return null
  },
})

export const updateOpenRouterResponse = internalMutation({
  args: {
    assistantMessageId: v.id("messages"),
    content: v.string(),
    reasoningSteps: v.optional(v.array(v.string())),
    terminalRuns: v.optional(v.array(terminalRunValidator)),
    uiPayload: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.content.length > MAX_MESSAGE_LENGTH)
      throw new Error("Response is too long")
    if (
      args.uiPayload &&
      args.uiPayload.length > MAX_GENERATIVE_UI_PAYLOAD_LENGTH
    )
      throw new Error("Generated interface is too large")
    const message = await ctx.db.get(args.assistantMessageId)
    if (
      message?.role === "assistant" &&
      (message.status === "pending" || message.status === "streaming")
    ) {
      await ctx.db.patch(message._id, {
        content: args.content,
        ...(args.reasoningSteps ? { reasoningSteps: args.reasoningSteps } : {}),
        ...(args.terminalRuns ? { terminalRuns: args.terminalRuns } : {}),
        ...(args.uiPayload ? { uiPayload: args.uiPayload } : {}),
        status: "streaming",
      })
    }
    return null
  },
})

export const archive = mutation({
  args: { conversationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (conversation.status !== "archived") {
      await ctx.db.patch(conversation._id, {
        status: "archived",
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const unarchive = mutation({
  args: { conversationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    if (conversation.status !== "active") {
      await ctx.db.patch(conversation._id, {
        status: "active",
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const moveToProject = mutation({
  args: {
    conversationId: v.string(),
    projectId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    const projectId: Id<"projects"> | undefined = args.projectId
      ? (ctx.db.normalizeId("projects", args.projectId) ?? undefined)
      : undefined
    if (args.projectId && !projectId) throw new Error("Project unavailable")
    if (projectId) {
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== user._id)
        throw new Error("Project unavailable")
    }
    await ctx.db.patch(conversation._id, {
      projectId,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const remove = mutation({
  args: { conversationId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await getOwnedConversation(
      ctx,
      user._id,
      args.conversationId
    )
    await deleteConversationMessages(ctx, conversation._id)
    await ctx.scheduler.runAfter(
      0,
      internal.memoryRetention.eraseConversationMemoryArtifacts,
      { conversationId: conversation._id, ownerId: user._id }
    )
    await ctx.db.delete(conversation._id)
    if (!conversation.projectId)
      await ctx.scheduler.runAfter(
        0,
        internal.terminalSandboxActions.removeWorkspace,
        { key: conversation._id, scope: "chat" }
      )
    return null
  },
})

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    projectId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    unassignedOnly: v.optional(v.boolean()),
  },
  returns: v.array(conversationValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const requestedLimit = args.limit ?? MAX_CONVERSATIONS
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(Math.floor(requestedLimit), MAX_CONVERSATIONS))
      : MAX_CONVERSATIONS
    const status = args.status ?? "active"

    if (args.projectId) {
      const projectId = ctx.db.normalizeId("projects", args.projectId)
      if (!projectId) return []
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== user._id) return []

      return await ctx.db
        .query("conversations")
        .withIndex("by_project_id_and_status_and_updated_at", (indexQuery) =>
          indexQuery.eq("projectId", project._id).eq("status", status)
        )
        .order("desc")
        .take(limit)
    }

    if (args.unassignedOnly) {
      return await ctx.db
        .query("conversations")
        .withIndex("by_owner_status_updated_at", (indexQuery) =>
          indexQuery.eq("ownerId", user._id).eq("status", status)
        )
        .filter((filterQuery) =>
          filterQuery.eq(filterQuery.field("projectId"), undefined)
        )
        .order("desc")
        .take(limit)
    }

    return await ctx.db
      .query("conversations")
      .withIndex("by_owner_status_updated_at", (indexQuery) =>
        indexQuery.eq("ownerId", user._id).eq("status", status)
      )
      .order("desc")
      .take(limit)
  },
})

export const listWorkspaceRecent = query({
  args: {
    limit: v.optional(v.number()),
    outputMode: outputModeValidator,
    projectId: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
    unassignedOnly: v.optional(v.boolean()),
  },
  returns: workspaceHistoryResultValidator,
  handler: async (ctx, args) => {
    // Compound workspace indexes stay staged until their production backfills
    // complete. Transitional queries cap reads and report when that cap means
    // the returned history may be incomplete.
    const user = await getCurrentUser(ctx)
    const requestedLimit = args.limit ?? MAX_CONVERSATIONS
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(Math.floor(requestedLimit), MAX_CONVERSATIONS))
      : MAX_CONVERSATIONS
    const status = args.status ?? "active"

    if (args.projectId) {
      const projectId = ctx.db.normalizeId("projects", args.projectId)
      if (!projectId) return { conversations: [], isPartial: false }
      const project = await ctx.db.get(projectId)
      if (!project || project.ownerId !== user._id)
        return { conversations: [], isPartial: false }

      const page = await ctx.db
        .query("conversations")
        .withIndex("by_project_id_and_status_and_updated_at", (indexQuery) =>
          indexQuery.eq("projectId", project._id).eq("status", status)
        )
        .order("desc")
        .filter((filterQuery) =>
          filterQuery.and(
            filterQuery.eq(filterQuery.field("ownerId"), user._id),
            args.outputMode === "image"
              ? filterQuery.eq(filterQuery.field("outputMode"), "image")
              : filterQuery.or(
                  filterQuery.eq(filterQuery.field("outputMode"), "text"),
                  filterQuery.eq(filterQuery.field("outputMode"), undefined)
                )
          )
        )
        .paginate({
          cursor: null,
          maximumRowsRead: MAX_WORKSPACE_HISTORY_ROWS_READ,
          numItems: limit,
        })
      const conversations = page.page.slice(0, limit)
      return {
        conversations,
        isPartial: conversations.length < limit && !page.isDone,
      }
    }

    if (args.unassignedOnly) {
      const page = await ctx.db
        .query("conversations")
        .withIndex("by_owner_status_updated_at", (indexQuery) =>
          indexQuery.eq("ownerId", user._id).eq("status", status)
        )
        .order("desc")
        .filter((filterQuery) =>
          filterQuery.and(
            filterQuery.eq(filterQuery.field("projectId"), undefined),
            args.outputMode === "image"
              ? filterQuery.eq(filterQuery.field("outputMode"), "image")
              : filterQuery.or(
                  filterQuery.eq(filterQuery.field("outputMode"), "text"),
                  filterQuery.eq(filterQuery.field("outputMode"), undefined)
                )
          )
        )
        .paginate({
          cursor: null,
          maximumRowsRead: MAX_WORKSPACE_HISTORY_ROWS_READ,
          numItems: limit,
        })
      const conversations = page.page.slice(0, limit)
      return {
        conversations,
        isPartial: conversations.length < limit && !page.isDone,
      }
    }

    const page = await ctx.db
      .query("conversations")
      .withIndex("by_owner_status_updated_at", (indexQuery) =>
        indexQuery.eq("ownerId", user._id).eq("status", status)
      )
      .order("desc")
      .filter((filterQuery) =>
        args.outputMode === "image"
          ? filterQuery.eq(filterQuery.field("outputMode"), "image")
          : filterQuery.or(
              filterQuery.eq(filterQuery.field("outputMode"), "text"),
              filterQuery.eq(filterQuery.field("outputMode"), undefined)
            )
      )
      .paginate({
        cursor: null,
        maximumRowsRead: MAX_WORKSPACE_HISTORY_ROWS_READ,
        numItems: limit,
      })
    const conversations = page.page.slice(0, limit)
    return {
      conversations,
      isPartial: conversations.length < limit && !page.isDone,
    }
  },
})

export const get = query({
  args: { conversationId: v.string() },
  returns: v.union(conversationValidator, v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) return null
    const conversation = await ctx.db.get(conversationId)

    return conversation?.ownerId === user._id ? conversation : null
  },
})

export const listMessages = query({
  args: { conversationId: v.string() },
  returns: v.array(clientMessageValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversationId = ctx.db.normalizeId(
      "conversations",
      args.conversationId
    )
    if (!conversationId) return []
    const conversation = await ctx.db.get(conversationId)

    if (!conversation || conversation.ownerId !== user._id) return []

    const allMessages = await getConversationMessages(ctx, conversation._id)
    const messages = await resolveBranchTranscript(ctx, conversation)
    const branches = conversation.activeBranchId
      ? await ctx.db
          .query("conversationBranches")
          .withIndex("by_conversation", (indexQuery) =>
            indexQuery.eq("conversationId", conversation._id)
          )
          .take(MAX_MESSAGES)
      : []
    const branchesById = new Map(
      branches.map((branch) => [branch._id, branch] as const)
    )
    const rootBranchId = conversation.activeBranchId
      ? (
          await getBranchChain(
            ctx,
            conversation._id,
            conversation.activeBranchId
          )
        ).at(0)?._id
      : undefined

    const getBranchNavigation = (message: Message, messageIndex: number) => {
      if (message.role !== "assistant" || !rootBranchId) return undefined
      const ownBranchId = message.branchId ?? rootBranchId
      const ownBranch = branchesById.get(ownBranchId)
      if (!ownBranch) return undefined
      const ownBranchMessages = allMessages.filter(
        (item) =>
          item.branchId === ownBranchId ||
          (ownBranchId === rootBranchId && item.branchId === undefined)
      )
      const firstAssistant = ownBranchMessages.find(
        (item) => item.role === "assistant"
      )
      const isForkResponse =
        ownBranch.parentBranchId && firstAssistant?._id === message._id
      const groupBranchId = isForkResponse
        ? ownBranch.parentBranchId
        : ownBranchId
      const forkedAfterMessageId = isForkResponse
        ? ownBranch.forkedAfterMessageId
        : messages
            .slice(0, messageIndex)
            .findLast((item) => item.role === "user")?._id
      const childBranches = branches
        .filter(
          (branch) =>
            branch.parentBranchId === groupBranchId &&
            branch.forkedAfterMessageId === forkedAfterMessageId
        )
        .sort((left, right) => left.createdAt - right.createdAt)
      const variants = [
        groupBranchId,
        ...childBranches.map((branch) => branch._id),
      ]
      const index = variants.findIndex((branchId) => branchId === ownBranchId)
      if (variants.length < 2 || index < 0) return undefined
      return {
        branchId: ownBranchId,
        index,
        total: variants.length,
        ...(variants.at(index - 1)
          ? { previousBranchId: variants.at(index - 1) }
          : {}),
        ...(variants.at(index + 1)
          ? { nextBranchId: variants.at(index + 1) }
          : {}),
      }
    }
    return await Promise.all(
      messages.map(async (message, messageIndex) => {
        const branchNavigation = getBranchNavigation(message, messageIndex)
        return {
          ...message,
          ...(branchNavigation ? { branchNavigation } : {}),
          attachments: (
            await Promise.all(
              (message.attachments ?? []).map(async (attachment) => {
                const url = await ctx.storage.getUrl(attachment.storageId)
                return url ? { ...attachment, url } : null
              })
            )
          ).filter((attachment) => attachment !== null),
        }
      })
    )
  },
})
