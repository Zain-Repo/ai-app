import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { internalMutation, internalQuery } from "./_generated/server"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { isSafeDurableMemory, isSensitiveMemory, MEMORY_EMBEDDING_DIMENSIONS, normalizeEditedMemory } from "./memoryPolicy"
import {
  createMemoryTombstoneHash,
  getMemoryScopeKey,
  MAX_ACTIVE_MEMORY_ITEMS,
  MEMORY_CANDIDATE_RETENTION_MS,
  memoryCategoryValidator,
  memoryScopeValidator,
  memorySourceSignalValidator,
} from "./memoryTypes"

const candidateValidator = v.object({
  canonicalKey: v.string(),
  content: v.string(),
  category: memoryCategoryValidator,
  scope: memoryScopeValidator,
  sourceSignal: memorySourceSignalValidator,
})

function normalizeCanonicalKey(value: string) {
  const key = value.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(key))
    throw new Error("Memory key is invalid")
  return key
}

async function validateMessageSource(
  ctx: MutationCtx | QueryCtx,
  ownerId: Id<"users">,
  conversationId: Id<"conversations">,
  messageId: Id<"messages">
) {
  const [owner, conversation, message] = await Promise.all([
    ctx.db.get(ownerId),
    ctx.db.get(conversationId),
    ctx.db.get(messageId),
  ])
  if (
    !owner ||
    !conversation ||
    conversation.ownerId !== ownerId ||
    !message ||
    message.conversationId !== conversationId ||
    message.role !== "user" ||
    message.status !== "complete"
  ) {
    return null
  }
  return { owner, conversation, message }
}

export const enqueueForMessage = internalMutation({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  },
  returns: v.union(v.id("memoryJobs"), v.null()),
  handler: async (ctx, args) => {
    const source = await validateMessageSource(
      ctx,
      args.ownerId,
      args.conversationId,
      args.messageId
    )
    if (
      !source ||
      !(source.owner.memoryEnabled ?? false) ||
      source.conversation.memoryMode === "off" ||
      source.conversation.memoryMode === "read_only"
    ) {
      return null
    }
    const profile = await ctx.db
      .query("memoryProcessingProfiles")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
      .unique()
    if (!profile || profile.status !== "active") return null
    const existing = await ctx.db
      .query("memoryJobs")
      .withIndex("by_source_message_id_and_policy_revision", (q) =>
        q
          .eq("sourceMessageId", args.messageId)
          .eq("policyRevision", profile.policyRevision)
      )
      .unique()
    if (existing) return existing._id
    const now = Date.now()
    const jobId = await ctx.db.insert("memoryJobs", {
      ownerId: args.ownerId,
      kind: "capture",
      sourceConversationId: args.conversationId,
      sourceMessageId: args.messageId,
      profileId: profile._id,
      profileRevision: profile.policyRevision,
      policyRevision: profile.policyRevision,
      status: "queued",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, internal.memoryActions.processCapture, {
      jobId,
    })
    return jobId
  },
})

const processingContextValidator = v.union(
  v.object({
    ciphertext: v.string(),
    iv: v.string(),
    connectionId: v.id("providerConnections"),
    provider: v.union(v.literal("openrouter"), v.literal("openai")),
    extractionModel: v.string(),
    embeddingModel: v.string(),
    profileId: v.id("memoryProcessingProfiles"),
    policyRevision: v.number(),
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    messageContent: v.string(),
    hasProject: v.boolean(),
    allowsUserScope: v.boolean(),
    existingKeys: v.array(
      v.object({ key: v.string(), scope: memoryScopeValidator })
    ),
    memoryRevision: v.number(),
    projectId: v.optional(v.id("projects")),
    sourceMessageCreatedAt: v.number(),
  }),
  v.null()
)

const embeddingProcessingContextValidator = v.union(
  v.object({
    ciphertext: v.string(),
    iv: v.string(),
    connectionId: v.id("providerConnections"),
    provider: v.union(v.literal("openrouter"), v.literal("openai")),
    profileId: v.id("memoryProcessingProfiles"),
    policyRevision: v.number(),
    ownerId: v.id("users"),
    memoryItemId: v.id("memoryItems"),
    content: v.string(),
    revision: v.number(),
  }),
  v.null()
)

export const getProcessingContext = internalQuery({
  args: {
    jobId: v.id("memoryJobs"),
    useLegacy: v.optional(v.boolean()),
    includeLegacyExistingKeys: v.optional(v.boolean()),
  },
  returns: processingContextValidator,
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (
      !job ||
      job.kind !== "capture" ||
      job.status !== "running" ||
      !job.sourceConversationId ||
      !job.sourceMessageId ||
      !job.profileId
    ) {
      return null
    }
    const source = await validateMessageSource(
      ctx,
      job.ownerId,
      job.sourceConversationId,
      job.sourceMessageId
    )
    const profile = await ctx.db.get(job.profileId)
    if (
      !source ||
      !(source.owner.memoryEnabled ?? false) ||
      (source.conversation.memoryMode ?? "standard") !== "standard" ||
      !profile ||
      profile.ownerId !== job.ownerId ||
      profile.policyRevision !== job.profileRevision ||
      profile.status !== "active"
    ) {
      return null
    }
    const connection = await ctx.db.get(profile.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== job.ownerId ||
      connection.provider !== profile.provider ||
      connection.status !== "connected"
    ) {
      return null
    }
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (q) => q.eq("connectionId", connection._id))
      .unique()
    if (!credential) return null
    const project = source.conversation.projectId
      ? await ctx.db.get(source.conversation.projectId)
      : null
    if (source.conversation.projectId && (!project || project.ownerId !== job.ownerId))
      return null
    const allowedScopeKeys = [
      ...(project?.memoryScope === "project_only" ? [] : ["user"]),
      ...(project ? [`project:${project._id}`] : []),
    ]
    const existing = await Promise.all(
      allowedScopeKeys.map(async (scopeKey) =>
        args.useLegacy
          ? await ctx.db
              .query("memories")
              .withIndex("by_owner_id_and_scope_key_and_key", (q) =>
                q.eq("ownerId", job.ownerId).eq("scopeKey", scopeKey)
              )
              .take(100)
          : await ctx.db
              .query("memoryItems")
              .withIndex("by_owner_id_and_scope_key_and_status_and_updated_at", (q) =>
                q.eq("ownerId", job.ownerId).eq("scopeKey", scopeKey).eq("status", "active")
              )
              .take(100)
      )
    )
    const legacyExisting =
      !args.useLegacy && args.includeLegacyExistingKeys
        ? await Promise.all(
            allowedScopeKeys.map(async (scopeKey) =>
              await ctx.db
                .query("memories")
                .withIndex("by_owner_id_and_scope_key_and_key", (q) =>
                  q.eq("ownerId", job.ownerId).eq("scopeKey", scopeKey)
                )
                .take(100)
            )
          )
        : []
    const existingKeys = existing
      .flat()
      .concat(legacyExisting.flat())
      .filter(
        (item) =>
          "key" in item ||
          ("confirmation" in item && item.confirmation === "confirmed")
      )
      .map((item) => ({
        key: "key" in item ? item.key : item.canonicalKey,
        scope: item.scope,
      }))
    const uniqueExistingKeys = Array.from(
      new Map(existingKeys.map((item) => [`${item.scope}:${item.key}`, item])).values()
    ).slice(0, 100)
    return {
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      connectionId: connection._id,
      provider: profile.provider,
      extractionModel: profile.extractionModel,
      embeddingModel: profile.embeddingModel,
      profileId: profile._id,
      policyRevision: profile.policyRevision,
      ownerId: job.ownerId,
      conversationId: source.conversation._id,
      messageId: source.message._id,
      messageContent: source.message.content,
      hasProject: Boolean(project),
      allowsUserScope: project?.memoryScope !== "project_only",
      memoryRevision: source.owner.memoryRevision ?? 0,
      ...(project ? { projectId: project._id } : {}),
      sourceMessageCreatedAt: source.message._creationTime,
      existingKeys: uniqueExistingKeys,
    }
  },
})

export const getEmbeddingProcessingContext = internalQuery({
  args: { jobId: v.id("memoryJobs") },
  returns: embeddingProcessingContextValidator,
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (
      !job ||
      job.kind !== "embed" ||
      job.status !== "running" ||
      !job.profileId ||
      !job.memoryItemId
    ) {
      return null
    }
    const [owner, profile, item] = await Promise.all([
      ctx.db.get(job.ownerId),
      ctx.db.get(job.profileId),
      ctx.db.get(job.memoryItemId),
    ])
    if (
      !owner ||
      !(owner.memoryEnabled ?? false) ||
      !profile ||
      profile.ownerId !== job.ownerId ||
      profile.policyRevision !== job.profileRevision ||
      profile.status !== "active" ||
      !item ||
      item.ownerId !== job.ownerId ||
      item.status !== "active" ||
      item.confirmation !== "confirmed" ||
      item.sensitivity !== "normal"
    ) {
      return null
    }
    const connection = await ctx.db.get(profile.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== job.ownerId ||
      connection.provider !== profile.provider ||
      connection.status !== "connected"
    ) {
      return null
    }
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (q) => q.eq("connectionId", connection._id))
      .unique()
    if (!credential) return null
    return {
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      connectionId: connection._id,
      provider: profile.provider,
      profileId: profile._id,
      policyRevision: profile.policyRevision,
      ownerId: job.ownerId,
      memoryItemId: item._id,
      content: item.content,
      revision: item.revision,
    }
  },
})

export const getEmbeddableItems = internalQuery({
  args: {
    ownerId: v.id("users"),
    profileId: v.id("memoryProcessingProfiles"),
    policyRevision: v.number(),
    memoryItemIds: v.array(v.id("memoryItems")),
  },
  returns: v.array(
    v.object({
      memoryItemId: v.id("memoryItems"),
      content: v.string(),
      revision: v.number(),
      scopeKey: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId)
    if (
      !profile ||
      profile.ownerId !== args.ownerId ||
      profile.status !== "active" ||
      profile.policyRevision !== args.policyRevision
    ) {
      return []
    }
    const items = []
    for (const memoryItemId of args.memoryItemIds.slice(0, 5)) {
      const item = await ctx.db.get(memoryItemId)
      if (
        item?.ownerId === args.ownerId &&
        item.status === "active" &&
        item.confirmation === "confirmed" &&
        item.sensitivity === "normal"
      ) {
        items.push({
          memoryItemId: item._id,
          content: item.content,
          revision: item.revision,
          scopeKey: item.scopeKey,
        })
      }
    }
    return items
  },
})

export const getLegacyMirrorItems = internalQuery({
  args: {
    ownerId: v.id("users"),
    memoryItemIds: v.array(v.id("memoryItems")),
  },
  returns: v.array(
    v.object({
      content: v.string(),
      key: v.string(),
      kind: v.union(v.literal("preference"), v.literal("fact")),
      scope: memoryScopeValidator,
    })
  ),
  handler: async (ctx, args) => {
    const results = []
    for (const memoryItemId of args.memoryItemIds.slice(0, 5)) {
      const item = await ctx.db.get(memoryItemId)
      if (
        !item ||
        item.ownerId !== args.ownerId ||
        item.status !== "active" ||
        item.confirmation !== "confirmed" ||
        item.sensitivity !== "normal"
      ) {
        continue
      }
      results.push({
        content: item.content,
        key: item.canonicalKey,
        kind: item.category === "preference" ? ("preference" as const) : ("fact" as const),
        scope: item.scope,
      })
    }
    return results
  },
})

export const applySearchDocuments = internalMutation({
  args: {
    ownerId: v.id("users"),
    profileId: v.id("memoryProcessingProfiles"),
    policyRevision: v.number(),
    documents: v.array(
      v.object({
        memoryItemId: v.id("memoryItems"),
        content: v.string(),
        contentHash: v.string(),
        itemRevision: v.number(),
        embedding: v.array(v.float64()),
      })
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const [owner, profile] = await Promise.all([
      ctx.db.get(args.ownerId),
      ctx.db.get(args.profileId),
    ])
    if (
      !owner ||
      owner._id !== args.ownerId ||
      !(owner.memoryEnabled ?? false) ||
      !profile ||
      profile.ownerId !== args.ownerId ||
      profile.status !== "active" ||
      profile.policyRevision !== args.policyRevision ||
      profile.dimensions !== MEMORY_EMBEDDING_DIMENSIONS
    ) {
      return 0
    }
    let inserted = 0
    const now = Date.now()
    for (const document of args.documents.slice(0, 5)) {
      if (
        document.embedding.length !== MEMORY_EMBEDDING_DIMENSIONS ||
        document.embedding.some((value) => !Number.isFinite(value))
      ) {
        continue
      }
      const item = await ctx.db.get(document.memoryItemId)
      if (
        !item ||
        item.ownerId !== args.ownerId ||
        item.status !== "active" ||
        item.revision !== document.itemRevision ||
        item.content !== document.content
      ) {
        continue
      }
      const stale = await ctx.db
        .query("memorySearchDocuments")
        .withIndex("by_memory_item_id_and_profile_revision", (q) =>
          q
            .eq("memoryItemId", item._id)
            .eq("profileRevision", args.policyRevision)
        )
        .take(MAX_ACTIVE_MEMORY_ITEMS + 1)
      for (const oldDocument of stale) await ctx.db.delete(oldDocument._id)
      await ctx.db.insert("memorySearchDocuments", {
        ownerId: args.ownerId,
        memoryItemId: item._id,
        scopeKey: item.scopeKey,
        searchScope: `${args.ownerId}:${item.scopeKey}:profile:${args.policyRevision}`,
        profileId: profile._id,
        profileRevision: args.policyRevision,
        itemRevision: item.revision,
        contentHash: document.contentHash,
        content: document.content,
        embedding: document.embedding,
        updatedAt: now,
      })
      inserted += 1
    }
    return inserted
  },
})

export const commitCandidates = internalMutation({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    profileId: v.id("memoryProcessingProfiles"),
    policyRevision: v.number(),
    memoryRevision: v.number(),
    candidates: v.array(candidateValidator),
  },
  returns: v.array(v.id("memoryItems")),
  handler: async (ctx, args) => {
    const source = await validateMessageSource(
      ctx,
      args.ownerId,
      args.conversationId,
      args.messageId
    )
    if (
      !source ||
      !(source.owner.memoryEnabled ?? false) ||
      (source.owner.memoryRevision ?? 0) !== args.memoryRevision ||
      (source.conversation.memoryMode ?? "standard") !== "standard"
    ) {
      return []
    }
    const profile = await ctx.db.get(args.profileId)
    if (
      !profile ||
      profile.ownerId !== args.ownerId ||
      profile.status !== "active" ||
      profile.policyRevision !== args.policyRevision
    ) {
      return []
    }
    const project = source.conversation.projectId
      ? await ctx.db.get(source.conversation.projectId)
      : null
    if (source.conversation.projectId && (!project || project.ownerId !== args.ownerId))
      return []
    const active = await ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
        q.eq("ownerId", args.ownerId).eq("status", "active")
      )
      .take(MAX_ACTIVE_MEMORY_ITEMS)
    let capacity = active.length
    // Each incoming candidate must consume a different eviction slot. Reusing
    // `find` here could archive the same row repeatedly and allow this batch
    // to exceed the active-memory limit.
    const evictableIds = active
      .filter((item) => item.confirmation === "pending" && !item.pinned)
      .map((item) => item._id)
    let evictableIndex = 0
    const committed: Id<"memoryItems">[] = []
    const now = Date.now()
    for (const candidate of args.candidates.slice(0, 5)) {
      const canonicalKey = normalizeCanonicalKey(candidate.canonicalKey)
      if (!isSafeDurableMemory(canonicalKey, candidate.content)) continue
      const content = normalizeEditedMemory(canonicalKey, candidate.content)
      if (candidate.scope === "project" && !project) continue
      if (candidate.scope === "user" && project?.memoryScope === "project_only")
        continue
      const scopeKey = getMemoryScopeKey(candidate.scope, project?._id)
      const tombstone = await ctx.db
        .query("memoryTombstones")
        .withIndex("by_owner_id_and_key_hash", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq(
              "keyHash",
              createMemoryTombstoneHash(args.ownerId, scopeKey, canonicalKey)
            )
        )
        .unique()
      if (tombstone?.expiresAt && tombstone.expiresAt > now) continue
      const sensitive = isSensitiveMemory(canonicalKey, content)
      const direct = candidate.sourceSignal === "direct_statement" && !sensitive
      const status = direct ? "active" : "candidate"
      const confirmation = direct ? "confirmed" : "pending"
      const sameKeyItems = await ctx.db
        .query("memoryItems")
        .withIndex("by_owner_id_and_scope_key_and_canonical_key", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("scopeKey", scopeKey)
            .eq("canonicalKey", canonicalKey)
        )
        .take(MAX_ACTIVE_MEMORY_ITEMS + 1)
      const existing = sameKeyItems.find(
        (item) => item.status === "active"
      ) ?? sameKeyItems.find((item) => item.status !== "removed")
      if (existing?.status === "removed") continue
      if (existing) {
        // A generated fact cannot silently overwrite a manual/pinned truth.
        if (
          existing.status === "active" &&
          existing.confirmation === "confirmed" &&
          (existing.pinned || existing.sourceSignal === "manual")
        ) {
          if (existing.content === content) {
            await ctx.db.insert("memoryEvidence", {
              ownerId: args.ownerId,
              memoryItemId: existing._id,
              sourceConversationId: source.conversation._id,
              sourceMessageId: source.message._id,
              sourceSignal: candidate.sourceSignal,
              createdAt: now,
            })
            continue
          }
          const matchingProposal = sameKeyItems.find(
            (item) =>
              item.status === "needs_review" &&
              item.confirmation === "pending"
          )
          if (matchingProposal) {
            if (matchingProposal.content !== content) {
              const revision = matchingProposal.revision + 1
              await ctx.db.patch(matchingProposal._id, {
                content,
                category: candidate.category,
                sourceSignal: candidate.sourceSignal,
                sensitivity: sensitive ? "sensitive" : "normal",
                revision,
                sourceConversationId: source.conversation._id,
                sourceMessageId: source.message._id,
                sourceTimestamp: source.message._creationTime,
                updatedAt: now,
              })
              await ctx.db.insert("memoryVersions", {
                ownerId: args.ownerId,
                memoryItemId: matchingProposal._id,
                revision,
                content,
                category: candidate.category,
                sourceSignal: candidate.sourceSignal,
                changedAt: now,
              })
            }
            await ctx.db.insert("memoryEvidence", {
              ownerId: args.ownerId,
              memoryItemId: matchingProposal._id,
              sourceConversationId: source.conversation._id,
              sourceMessageId: source.message._id,
              sourceSignal: candidate.sourceSignal,
              createdAt: now,
            })
            continue
          }
          const proposalId = await ctx.db.insert("memoryItems", {
            ownerId: args.ownerId,
            ...(project ? { projectId: project._id } : {}),
            scope: candidate.scope,
            scopeKey,
            category: candidate.category,
            canonicalKey,
            content,
            status: "needs_review",
            sourceSignal: candidate.sourceSignal,
            confirmation: "pending",
            pinned: false,
            sensitivity: sensitive ? "sensitive" : "normal",
            revision: 1,
            sourceConversationId: source.conversation._id,
            sourceMessageId: source.message._id,
            sourceTimestamp: source.message._creationTime,
            createdAt: now,
            updatedAt: now,
          })
          await ctx.db.insert("memoryVersions", {
            ownerId: args.ownerId,
            memoryItemId: proposalId,
            revision: 1,
            content,
            category: candidate.category,
            sourceSignal: candidate.sourceSignal,
            changedAt: now,
          })
          await ctx.db.insert("memoryEvidence", {
            ownerId: args.ownerId,
            memoryItemId: proposalId,
            sourceConversationId: source.conversation._id,
            sourceMessageId: source.message._id,
            sourceSignal: candidate.sourceSignal,
            createdAt: now,
          })
          committed.push(proposalId)
          continue
        }
        const revision = existing.revision + 1
        await ctx.db.patch(existing._id, {
          content,
          category: candidate.category,
          status,
          sourceSignal: candidate.sourceSignal,
          confirmation,
          sensitivity: sensitive ? "sensitive" : "normal",
          revision,
          sourceConversationId: source.conversation._id,
          sourceMessageId: source.message._id,
          sourceTimestamp: source.message._creationTime,
          ...(status === "candidate"
            ? { expiresAt: now + MEMORY_CANDIDATE_RETENTION_MS }
            : { expiresAt: undefined }),
          updatedAt: now,
        })
        await ctx.db.insert("memoryVersions", {
          ownerId: args.ownerId,
          memoryItemId: existing._id,
          revision,
          content,
          category: candidate.category,
          sourceSignal: candidate.sourceSignal,
          changedAt: now,
        })
        committed.push(existing._id)
        continue
      }
      if (status === "active" && capacity >= MAX_ACTIVE_MEMORY_ITEMS) {
        const evictableId = evictableIds[evictableIndex]
        if (!evictableId) continue
        evictableIndex += 1
        await ctx.db.patch(evictableId, {
          status: "archived",
          updatedAt: now,
        })
        capacity -= 1
      }
      const id = await ctx.db.insert("memoryItems", {
        ownerId: args.ownerId,
        ...(project ? { projectId: project._id } : {}),
        scope: candidate.scope,
        scopeKey,
        category: candidate.category,
        canonicalKey,
        content,
        status,
        sourceSignal: candidate.sourceSignal,
        confirmation,
        pinned: false,
        sensitivity: sensitive ? "sensitive" : "normal",
        revision: 1,
        sourceConversationId: source.conversation._id,
        sourceMessageId: source.message._id,
        sourceTimestamp: source.message._creationTime,
        ...(status === "candidate"
          ? { expiresAt: now + MEMORY_CANDIDATE_RETENTION_MS }
          : {}),
        createdAt: now,
        updatedAt: now,
      })
      await ctx.db.insert("memoryVersions", {
        ownerId: args.ownerId,
        memoryItemId: id,
        revision: 1,
        content,
        category: candidate.category,
        sourceSignal: candidate.sourceSignal,
        changedAt: now,
      })
      await ctx.db.insert("memoryEvidence", {
        ownerId: args.ownerId,
        memoryItemId: id,
        sourceConversationId: source.conversation._id,
        sourceMessageId: source.message._id,
        sourceSignal: candidate.sourceSignal,
        createdAt: now,
      })
      if (status === "active") capacity += 1
      committed.push(id)
    }
    return committed
  },
})

export const applyDeletions = internalMutation({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    profileId: v.id("memoryProcessingProfiles"),
    policyRevision: v.number(),
    memoryRevision: v.number(),
    deletions: v.array(
      v.object({ key: v.string(), scope: memoryScopeValidator })
    ),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const source = await validateMessageSource(
      ctx,
      args.ownerId,
      args.conversationId,
      args.messageId
    )
    const profile = await ctx.db.get(args.profileId)
    if (
      !source ||
      (source.owner.memoryRevision ?? 0) !== args.memoryRevision ||
      (source.conversation.memoryMode ?? "standard") !== "standard" ||
      !profile ||
      profile.ownerId !== args.ownerId ||
      profile.status !== "active" ||
      profile.policyRevision !== args.policyRevision
    ) {
      return 0
    }
    const project = source.conversation.projectId
      ? await ctx.db.get(source.conversation.projectId)
      : null
    const now = Date.now()
    let removed = 0
    for (const deletion of args.deletions.slice(0, 5)) {
      if (deletion.scope === "project" && !project) continue
      if (deletion.scope === "user" && project?.memoryScope === "project_only")
        continue
      const scopeKey = getMemoryScopeKey(deletion.scope, project?._id)
      const items = await ctx.db
        .query("memoryItems")
        .withIndex("by_owner_id_and_scope_key_and_canonical_key", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("scopeKey", scopeKey)
            .eq("canonicalKey", deletion.key)
        )
        .take(MAX_ACTIVE_MEMORY_ITEMS + 1)
      const matchingItems = items.filter((item) =>
        ["active", "candidate", "needs_review"].includes(item.status)
      )
      if (!matchingItems.length)
        continue
      const keyHash = createMemoryTombstoneHash(
        args.ownerId,
        scopeKey,
        deletion.key
      )
      const tombstone = await ctx.db
        .query("memoryTombstones")
        .withIndex("by_owner_id_and_key_hash", (q) =>
          q.eq("ownerId", args.ownerId).eq("keyHash", keyHash)
        )
        .unique()
      if (tombstone)
        await ctx.db.patch(tombstone._id, {
          expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
        })
      else
        await ctx.db.insert("memoryTombstones", {
          ownerId: args.ownerId,
          keyHash,
          createdAt: now,
          expiresAt: now + 30 * 24 * 60 * 60 * 1_000,
        })
      for (const item of matchingItems) {
        await ctx.db.patch(item._id, {
          status: "removed",
          removedAt: now,
          undoExpiresAt: now + 30_000,
          updatedAt: now,
        })
        removed += 1
      }
    }
    return removed
  },
})
