import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { getCurrentUser } from "./authHelpers"
import {
  getMemoryProcessingPolicy,
  isSensitiveMemory,
  normalizeEditedMemory,
} from "./memoryPolicy"
import {
  createMemoryTombstoneHash,
  getMemoryScopeKey,
  MAX_ACTIVE_MEMORY_ITEMS,
  MEMORY_TOMBSTONE_RETENTION_MS,
  MEMORY_UNDO_WINDOW_MS,
  memoryCategoryValidator,
  memoryScopeValidator,
} from "./memoryTypes"

const MAX_MEMORIES_PER_USER = 100
const MAX_RETRIEVED_MEMORIES = 8
const MAX_PERSONALIZATION_LIST = 100

type MemoryDatabaseContext = Parameters<typeof getCurrentUser>[0]

const v2MemoryForUiValidator = v.object({
  _id: v.id("memoryItems"),
  _creationTime: v.number(),
  projectId: v.optional(v.id("projects")),
  projectName: v.optional(v.string()),
  scope: memoryScopeValidator,
  category: memoryCategoryValidator,
  canonicalKey: v.string(),
  content: v.string(),
  status: v.union(
    v.literal("active"),
    v.literal("candidate"),
    v.literal("needs_review"),
    v.literal("archived"),
    v.literal("removed")
  ),
  sourceSignal: v.union(
    v.literal("manual"),
    v.literal("direct_statement"),
    v.literal("history_candidate"),
    v.literal("inferred")
  ),
  confirmation: v.union(v.literal("confirmed"), v.literal("pending")),
  pinned: v.boolean(),
  sensitivity: v.union(v.literal("normal"), v.literal("sensitive")),
  revision: v.number(),
  sourceConversationId: v.optional(v.id("conversations")),
  sourceMessageId: v.optional(v.id("messages")),
  sourceConversationTitle: v.optional(v.string()),
  sourceTimestamp: v.number(),
  expiresAt: v.optional(v.number()),
  removedAt: v.optional(v.number()),
  undoExpiresAt: v.optional(v.number()),
  lastUsedAt: v.optional(v.number()),
  updatedAt: v.number(),
})

const processingStatusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("needs_reauthentication"),
  v.literal("disconnected")
)

function toMemoryItemForUi(
  memory: Doc<"memoryItems">,
  labels: { projectName?: string; sourceConversationTitle?: string } = {}
) {
  return {
    _id: memory._id,
    _creationTime: memory._creationTime,
    ...(memory.projectId ? { projectId: memory.projectId } : {}),
    ...(labels.projectName ? { projectName: labels.projectName } : {}),
    scope: memory.scope,
    category: memory.category,
    canonicalKey: memory.canonicalKey,
    content: memory.content,
    status: memory.status,
    sourceSignal: memory.sourceSignal,
    confirmation: memory.confirmation,
    pinned: memory.pinned,
    sensitivity: memory.sensitivity,
    revision: memory.revision,
    ...(memory.sourceConversationId
      ? { sourceConversationId: memory.sourceConversationId }
      : {}),
    ...(memory.sourceMessageId ? { sourceMessageId: memory.sourceMessageId } : {}),
    ...(labels.sourceConversationTitle
      ? { sourceConversationTitle: labels.sourceConversationTitle }
      : {}),
    sourceTimestamp: memory.sourceTimestamp,
    ...(memory.expiresAt ? { expiresAt: memory.expiresAt } : {}),
    ...(memory.removedAt ? { removedAt: memory.removedAt } : {}),
    ...(memory.undoExpiresAt ? { undoExpiresAt: memory.undoExpiresAt } : {}),
    ...(memory.lastUsedAt ? { lastUsedAt: memory.lastUsedAt } : {}),
    updatedAt: memory.updatedAt,
  }
}

async function enrichMemoryItemsForUi(
  ctx: MemoryDatabaseContext,
  ownerId: Id<"users">,
  items: Doc<"memoryItems">[]
) {
  return await Promise.all(
    items.map(async (item) => {
      const [project, conversation] = await Promise.all([
        item.projectId ? ctx.db.get(item.projectId) : null,
        item.sourceConversationId ? ctx.db.get(item.sourceConversationId) : null,
      ])
      return toMemoryItemForUi(item, {
        ...(project?.ownerId === ownerId ? { projectName: project.name } : {}),
        ...(conversation?.ownerId === ownerId
          ? { sourceConversationTitle: conversation.title }
          : {}),
      })
    })
  )
}

function normalizeCanonicalKey(value: string) {
  const key = value.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(key))
    throw new Error("Memory key is invalid")
  return key
}

const memoryForUiValidator = v.object({
  _id: v.id("memories"),
  _creationTime: v.number(),
  key: v.string(),
  content: v.string(),
  scope: v.union(v.literal("user"), v.literal("project")),
  sourceConversationId: v.optional(v.id("conversations")),
  updatedAt: v.number(),
})

export const getSettings = query({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    memories: v.array(memoryForUiValidator),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_owner_id_and_updated_at", (indexQuery) =>
        indexQuery.eq("ownerId", user._id)
      )
      .order("desc")
      .take(MAX_MEMORIES_PER_USER)

    return {
      enabled: user.memoryEnabled ?? false,
      memories: memories.map(
        ({
          _creationTime,
          _id,
          content,
          key,
          scope,
          sourceConversationId,
          updatedAt,
        }) => ({
          _creationTime,
          _id,
          content,
          key,
          scope,
          ...(sourceConversationId ? { sourceConversationId } : {}),
          updatedAt,
        })
      ),
    }
  },
})

export const setEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    if ((user.memoryEnabled ?? false) === args.enabled) return null
    await ctx.db.patch(user._id, {
      memoryEnabled: args.enabled,
      memoryRevision: (user.memoryRevision ?? 0) + 1,
    })
    if (args.enabled) {
      const memoryIds = (
        await ctx.db
          .query("memories")
          .withIndex("by_owner_id_and_updated_at", (indexQuery) =>
            indexQuery.eq("ownerId", user._id)
          )
          .take(MAX_MEMORIES_PER_USER)
      )
        .filter(
          (memory) => memory.kind === "fact" && memory.embedding === undefined
        )
        .map((memory) => memory._id)
      if (memoryIds.length)
        await ctx.scheduler.runAfter(
          0,
          internal.openRouterResponses.embedMissingMemories,
          { memoryIds, ownerId: user._id }
        )
    }
    return null
  },
})

export const remove = mutation({
  args: {
    memoryId: v.optional(v.id("memories")),
    memoryItemId: v.optional(v.id("memoryItems")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    if (args.memoryItemId) {
      const item = await ctx.db.get(args.memoryItemId)
      if (!item || item.ownerId !== user._id) throw new Error("Memory unavailable")
      const now = Date.now()
      const keyHash = createMemoryTombstoneHash(
        user._id,
        item.scopeKey,
        item.canonicalKey
      )
      const tombstone = await ctx.db
        .query("memoryTombstones")
        .withIndex("by_owner_id_and_key_hash", (q) =>
          q.eq("ownerId", user._id).eq("keyHash", keyHash)
        )
        .unique()
      if (tombstone) await ctx.db.patch(tombstone._id, { expiresAt: now + MEMORY_TOMBSTONE_RETENTION_MS })
      else await ctx.db.insert("memoryTombstones", { ownerId: user._id, keyHash, createdAt: now, expiresAt: now + MEMORY_TOMBSTONE_RETENTION_MS })
      await ctx.db.patch(item._id, {
        status: "removed",
        removedAt: now,
        undoExpiresAt: now + MEMORY_UNDO_WINDOW_MS,
        updatedAt: now,
      })
      const searchDocuments = await ctx.db
        .query("memorySearchDocuments")
        .withIndex("by_memory_item_id_and_profile_revision", (q) =>
          q.eq("memoryItemId", item._id)
        )
        .take(10)
      for (const document of searchDocuments) await ctx.db.delete(document._id)
      await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
      return null
    }
    if (!args.memoryId) throw new Error("Memory unavailable")
    const memory = await ctx.db.get(args.memoryId)
    if (!memory || memory.ownerId !== user._id)
      throw new Error("Memory unavailable")
    await ctx.db.delete(memory._id)
    await ctx.db.patch(user._id, {
      memoryRevision: (user.memoryRevision ?? 0) + 1,
    })
    return null
  },
})

export const update = mutation({
  args: {
    content: v.string(),
    memoryId: v.optional(v.id("memories")),
    memoryItemId: v.optional(v.id("memoryItems")),
    category: v.optional(memoryCategoryValidator),
    canonicalKey: v.optional(v.string()),
    scope: v.optional(memoryScopeValidator),
    projectId: v.optional(v.id("projects")),
    confirmSensitive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    if (args.memoryItemId) {
      const item = await ctx.db.get(args.memoryItemId)
      if (!item || item.ownerId !== user._id || item.status === "removed")
        throw new Error("Memory unavailable")
      const scope = args.scope ?? item.scope
      const projectId = args.projectId ?? item.projectId
      await assertOwnedMemoryProject(ctx, user._id, projectId)
      if ((scope === "project") !== Boolean(projectId))
        throw new Error("Project memory scope is invalid")
      const canonicalKey = normalizeCanonicalKey(args.canonicalKey ?? item.canonicalKey)
      const content = normalizeEditedMemory(canonicalKey, args.content)
      if (isSensitiveMemory(canonicalKey, content) && !args.confirmSensitive)
        throw new Error("Sensitive memory requires explicit confirmation")
      const now = Date.now()
      const category = args.category ?? item.category
      const scopeKey = getMemoryScopeKey(scope, projectId)
      const duplicate = await ctx.db
        .query("memoryItems")
        .withIndex("by_owner_id_and_scope_key_and_canonical_key", (q) =>
          q.eq("ownerId", user._id).eq("scopeKey", scopeKey).eq("canonicalKey", canonicalKey)
        )
        .unique()
      if (duplicate && duplicate._id !== item._id && duplicate.status !== "removed")
        throw new Error("A memory with this key already exists")
      const revision = item.revision + 1
      await ctx.db.patch(item._id, {
        ...(projectId ? { projectId } : { projectId: undefined }),
        scope,
        scopeKey,
        category,
        canonicalKey,
        content,
        sourceSignal: "manual",
        confirmation: "confirmed",
        sensitivity: isSensitiveMemory(canonicalKey, content)
          ? "sensitive"
          : "normal",
        revision,
        sourceTimestamp: now,
        updatedAt: now,
      })
      await ctx.db.insert("memoryVersions", { ownerId: user._id, memoryItemId: item._id, revision, content, category, sourceSignal: "manual", changedAt: now })
      await ctx.db.insert("memoryEvidence", { ownerId: user._id, memoryItemId: item._id, sourceSignal: "manual", createdAt: now })
      const documents = await ctx.db
        .query("memorySearchDocuments")
        .withIndex("by_memory_item_id_and_profile_revision", (q) => q.eq("memoryItemId", item._id))
        .take(10)
      for (const document of documents) await ctx.db.delete(document._id)
      await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
      return null
    }
    if (!args.memoryId) throw new Error("Memory unavailable")
    const memory = await ctx.db.get(args.memoryId)
    if (!memory || memory.ownerId !== user._id)
      throw new Error("Memory unavailable")
    const content = normalizeEditedMemory(memory.key, args.content)
    const now = Date.now()
    await ctx.db.patch(memory._id, {
      content,
      embedding: undefined,
      sourceConversationId: undefined,
      sourceMessageId: undefined,
      sourceTimestamp: now,
      updatedAt: now,
    })
    await ctx.db.patch(user._id, {
      memoryRevision: (user.memoryRevision ?? 0) + 1,
    })
    if (memory.kind === "fact" && user.memoryEnabled) {
      await ctx.scheduler.runAfter(
        0,
        internal.openRouterResponses.embedMemory,
        {
          content,
          memoryId: memory._id,
        }
      )
    }
    return null
  },
})

export const clear = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const memories = await ctx.db
      .query("memories")
      .withIndex("by_owner_id_and_updated_at", (indexQuery) =>
        indexQuery.eq("ownerId", user._id)
      )
      .take(MAX_MEMORIES_PER_USER)
    for (const memory of memories) await ctx.db.delete(memory._id)
    const items = await ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
        q.eq("ownerId", user._id).eq("status", "active")
      )
      .take(MAX_ACTIVE_MEMORY_ITEMS)
    const now = Date.now()
    for (const item of items) {
      const keyHash = createMemoryTombstoneHash(
        user._id,
        item.scopeKey,
        item.canonicalKey
      )
      const existingTombstone = await ctx.db
        .query("memoryTombstones")
        .withIndex("by_owner_id_and_key_hash", (q) =>
          q.eq("ownerId", user._id).eq("keyHash", keyHash)
        )
        .unique()
      if (existingTombstone)
        await ctx.db.patch(existingTombstone._id, {
          expiresAt: now + MEMORY_TOMBSTONE_RETENTION_MS,
        })
      else
        await ctx.db.insert("memoryTombstones", {
          ownerId: user._id,
          keyHash,
          createdAt: now,
          expiresAt: now + MEMORY_TOMBSTONE_RETENTION_MS,
        })
      await ctx.db.patch(item._id, {
        status: "removed",
        removedAt: now,
        undoExpiresAt: now + MEMORY_UNDO_WINDOW_MS,
        updatedAt: now,
      })
    }
    await ctx.db.patch(user._id, {
      memoryRevision: (user.memoryRevision ?? 0) + 1,
    })
    return null
  },
})

export const hydrateSearchResults = internalQuery({
  args: {
    memoryIds: v.array(v.id("memories")),
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.array(
    v.object({
      _id: v.id("memories"),
      content: v.string(),
      key: v.string(),
      kind: v.union(v.literal("preference"), v.literal("fact")),
      scope: v.union(v.literal("user"), v.literal("project")),
    })
  ),
  handler: async (ctx, args) => {
    const allowedScopeKeys = new Set([
      "user",
      ...(args.projectId ? [`project:${args.projectId}`] : []),
    ])
    const results = []
    for (const memoryId of args.memoryIds.slice(0, MAX_RETRIEVED_MEMORIES)) {
      const memory = await ctx.db.get(memoryId)
      if (
        memory &&
        memory.ownerId === args.ownerId &&
        allowedScopeKeys.has(memory.scopeKey)
      ) {
        results.push({
          _id: memory._id,
          content: memory.content,
          key: memory.key,
          kind: memory.kind,
          scope: memory.scope,
        })
      }
    }
    return results
  },
})

export const isEnabled = internalQuery({
  args: { memoryRevision: v.number(), ownerId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId)
    return (
      owner?.memoryEnabled === true &&
      (owner.memoryRevision ?? 0) === args.memoryRevision
    )
  },
})

export const upsertExtracted = internalMutation({
  args: {
    deletions: v.array(
      v.object({
        key: v.string(),
        scope: v.union(v.literal("user"), v.literal("project")),
      })
    ),
    memories: v.array(
      v.object({
        content: v.string(),
        embedding: v.optional(v.array(v.float64())),
        key: v.string(),
        kind: v.union(v.literal("preference"), v.literal("fact")),
        scope: v.union(v.literal("user"), v.literal("project")),
      })
    ),
    allowFactWithoutEmbedding: v.optional(v.boolean()),
    memoryRevision: v.number(),
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    sourceConversationId: v.id("conversations"),
    sourceMessageCreatedAt: v.number(),
    sourceMessageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId)
    const sourceConversation = await ctx.db.get(args.sourceConversationId)
    const sourceMessage = await ctx.db.get(args.sourceMessageId)
    if (
      !owner ||
      !owner.memoryEnabled ||
      (owner.memoryRevision ?? 0) !== args.memoryRevision ||
      !sourceConversation ||
      sourceConversation.ownerId !== owner._id ||
      sourceConversation.projectId !== args.projectId ||
      !sourceMessage ||
      sourceMessage.conversationId !== sourceConversation._id ||
      sourceMessage.role !== "user" ||
      sourceMessage.status !== "complete" ||
      sourceMessage._creationTime !== args.sourceMessageCreatedAt
    ) {
      return null
    }
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId)
      if (!project || project.ownerId !== owner._id) return null
    }

    let memoryCount = (
      await ctx.db
        .query("memories")
        .withIndex("by_owner_id_and_updated_at", (indexQuery) =>
          indexQuery.eq("ownerId", owner._id)
        )
        .take(MAX_MEMORIES_PER_USER)
    ).length
    const now = Date.now()

    for (const deletion of args.deletions) {
      const scopeKey =
        deletion.scope === "project" && args.projectId
          ? `project:${args.projectId}`
          : deletion.scope === "user"
            ? "user"
            : null
      if (!scopeKey) continue
      const existing = await ctx.db
        .query("memories")
        .withIndex("by_owner_id_and_scope_key_and_key", (indexQuery) =>
          indexQuery
            .eq("ownerId", owner._id)
            .eq("scopeKey", scopeKey)
            .eq("key", deletion.key)
        )
        .unique()
      if (
        existing &&
        (existing.sourceTimestamp < args.sourceMessageCreatedAt ||
          (existing.sourceTimestamp === args.sourceMessageCreatedAt &&
            existing.sourceMessageId === args.sourceMessageId))
      ) {
        await ctx.db.delete(existing._id)
        memoryCount -= 1
      }
    }

    for (const candidate of args.memories) {
      if (
        candidate.kind === "fact" &&
        !candidate.embedding &&
        !args.allowFactWithoutEmbedding
      )
        continue
      const scopeKey =
        candidate.scope === "project" && args.projectId
          ? `project:${args.projectId}`
          : candidate.scope === "user"
            ? "user"
            : null
      if (!scopeKey) continue
      const existing = await ctx.db
        .query("memories")
        .withIndex("by_owner_id_and_scope_key_and_key", (indexQuery) =>
          indexQuery
            .eq("ownerId", owner._id)
            .eq("scopeKey", scopeKey)
            .eq("key", candidate.key)
        )
        .unique()
      if (existing) {
        if (
          existing.sourceTimestamp > args.sourceMessageCreatedAt ||
          (existing.sourceTimestamp === args.sourceMessageCreatedAt &&
            existing.sourceMessageId !== args.sourceMessageId)
        )
          continue
        await ctx.db.patch(existing._id, {
          content: candidate.content,
          kind: candidate.kind,
          ...(candidate.kind === "preference"
            ? { embedding: undefined }
            : candidate.embedding
              ? { embedding: candidate.embedding }
              : {}),
          sourceConversationId: sourceConversation._id,
          sourceMessageId: sourceMessage._id,
          sourceTimestamp: args.sourceMessageCreatedAt,
          updatedAt: now,
        })
        continue
      }
      if (memoryCount >= MAX_MEMORIES_PER_USER) continue
      await ctx.db.insert("memories", {
        ownerId: owner._id,
        scope: candidate.scope,
        scopeKey,
        searchScope: `${owner._id}:${scopeKey}`,
        ...(candidate.scope === "project" && args.projectId
          ? { projectId: args.projectId }
          : {}),
        kind: candidate.kind,
        key: candidate.key,
        content: candidate.content,
        ...(candidate.kind === "fact" && candidate.embedding
          ? { embedding: candidate.embedding }
          : {}),
        sourceConversationId: sourceConversation._id,
        sourceMessageId: sourceMessage._id,
        sourceTimestamp: args.sourceMessageCreatedAt,
        updatedAt: now,
      })
      memoryCount += 1
    }
    return null
  },
})

export const getEmbeddingContext = internalQuery({
  args: { content: v.string(), memoryId: v.id("memories") },
  returns: v.union(
    v.object({ ciphertext: v.string(), iv: v.string() }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId)
    if (!memory || memory.kind !== "fact" || memory.content !== args.content)
      return null
    const owner = await ctx.db.get(memory.ownerId)
    if (!owner?.memoryEnabled) return null
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (indexQuery) =>
        indexQuery.eq("ownerId", memory.ownerId).eq("provider", "openrouter")
      )
      .unique()
    if (!connection || connection.status !== "connected") return null
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (indexQuery) =>
        indexQuery.eq("connectionId", connection._id)
      )
      .unique()
    return credential
      ? { ciphertext: credential.ciphertext, iv: credential.iv }
      : null
  },
})

export const getMissingEmbeddingContext = internalQuery({
  args: {
    memoryIds: v.array(v.id("memories")),
    ownerId: v.id("users"),
  },
  returns: v.union(
    v.object({
      ciphertext: v.string(),
      items: v.array(
        v.object({ content: v.string(), memoryId: v.id("memories") })
      ),
      iv: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId)
    if (!owner?.memoryEnabled) return null
    const items = []
    for (const memoryId of args.memoryIds.slice(0, MAX_MEMORIES_PER_USER)) {
      const memory = await ctx.db.get(memoryId)
      if (
        memory?.ownerId === owner._id &&
        memory.kind === "fact" &&
        memory.embedding === undefined
      )
        items.push({ content: memory.content, memoryId: memory._id })
    }
    if (!items.length) return null
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (indexQuery) =>
        indexQuery.eq("ownerId", owner._id).eq("provider", "openrouter")
      )
      .unique()
    if (!connection || connection.status !== "connected") return null
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (indexQuery) =>
        indexQuery.eq("connectionId", connection._id)
      )
      .unique()
    return credential
      ? { ciphertext: credential.ciphertext, items, iv: credential.iv }
      : null
  },
})

export const applyEmbedding = internalMutation({
  args: {
    content: v.string(),
    embedding: v.array(v.float64()),
    memoryId: v.id("memories"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId)
    if (
      memory?.kind === "fact" &&
      memory.content === args.content &&
      memory.embedding === undefined
    ) {
      await ctx.db.patch(memory._id, { embedding: args.embedding })
    }
    return null
  },
})

export const applyEmbeddings = internalMutation({
  args: {
    items: v.array(
      v.object({
        content: v.string(),
        embedding: v.array(v.float64()),
        memoryId: v.id("memories"),
      })
    ),
    ownerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId)
    if (!owner?.memoryEnabled) return null
    for (const item of args.items.slice(0, MAX_MEMORIES_PER_USER)) {
      const memory = await ctx.db.get(item.memoryId)
      if (
        memory?.ownerId === owner._id &&
        memory.kind === "fact" &&
        memory.content === item.content &&
        memory.embedding === undefined
      )
        await ctx.db.patch(memory._id, { embedding: item.embedding })
    }
    return null
  },
})

export function getMemorySearchScopes(
  ownerId: Id<"users">,
  projectId?: Id<"projects">,
  includeUser = true
) {
  return [
    ...(includeUser ? [`${ownerId}:user`] : []),
    ...(projectId ? [`${ownerId}:project:${projectId}`] : []),
  ]
}

// Provider-neutral Personalization v2. Legacy exports above intentionally stay
// available while older response adapters still read the `memories` table.
export const getPersonalization = query({
  args: {},
  returns: v.object({
    savedMemoryEnabled: v.boolean(),
    historyEnabled: v.boolean(),
    capacity: v.object({ active: v.number(), limit: v.number() }),
    processing: v.union(
      v.object({
        providerConnectionId: v.id("providerConnections"),
        provider: v.union(v.literal("openrouter"), v.literal("openai")),
        extractionModel: v.string(),
        embeddingModel: v.string(),
        dimensions: v.number(),
        policyRevision: v.number(),
        status: processingStatusValidator,
        updatedAt: v.number(),
      }),
      v.null()
    ),
    items: v.array(v2MemoryForUiValidator),
    legacyMemories: v.array(memoryForUiValidator),
    pendingJobs: v.number(),
    failedJobs: v.number(),
    historyBackfill: v.object({ eligible: v.number(), pending: v.number() }),
    degradedReason: v.union(
      v.literal("saved_memory_disabled"),
      v.literal("processing_unavailable"),
      v.null()
    ),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const [activeItems, candidateItems, reviewItems, legacyMemories, profile, queuedJobs, historyChats, failedJobs] =
      await Promise.all([
        ctx.db
          .query("memoryItems")
          .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "active")
          )
          .order("desc")
          .take(MAX_ACTIVE_MEMORY_ITEMS + 1),
        ctx.db
          .query("memoryItems")
          .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "candidate")
          )
          .order("desc")
          .take(MAX_PERSONALIZATION_LIST),
        ctx.db
          .query("memoryItems")
          .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "needs_review")
          )
          .order("desc")
          .take(MAX_PERSONALIZATION_LIST),
        ctx.db
          .query("memories")
          .withIndex("by_owner_id_and_updated_at", (q) =>
            q.eq("ownerId", user._id)
          )
          .order("desc")
          .take(MAX_PERSONALIZATION_LIST),
        ctx.db
          .query("memoryProcessingProfiles")
          .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
          .unique(),
        ctx.db
          .query("memoryJobs")
          .withIndex("by_owner_id_and_status_and_next_attempt_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "queued")
          )
          .take(MAX_PERSONALIZATION_LIST),
        ctx.db
          .query("conversations")
          .withIndex("by_owner_status_updated_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "active")
          )
          .take(MAX_PERSONALIZATION_LIST),
        ctx.db
          .query("memoryJobs")
          .withIndex("by_owner_id_and_status_and_next_attempt_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "failed")
          )
          .take(MAX_PERSONALIZATION_LIST),
      ])
    const savedMemoryEnabled = user.memoryEnabled ?? false
    const profileConnection = profile
      ? await ctx.db.get(profile.providerConnectionId)
      : null
    const processingStatus =
      !profile || !profileConnection || profileConnection.ownerId !== user._id
        ? "disconnected"
        : profileConnection.status === "connected"
          ? profile.status
          : profileConnection.status === "needs_reauthentication"
            ? "needs_reauthentication"
            : "disconnected"
    return {
      savedMemoryEnabled,
      historyEnabled: user.memoryHistoryEnabled ?? false,
      capacity: {
        active: Math.min(activeItems.length, MAX_ACTIVE_MEMORY_ITEMS),
        limit: MAX_ACTIVE_MEMORY_ITEMS,
      },
      processing: profile
        ? {
            providerConnectionId: profile.providerConnectionId,
            provider: profile.provider,
            extractionModel: profile.extractionModel,
            embeddingModel: profile.embeddingModel,
            dimensions: profile.dimensions,
            policyRevision: profile.policyRevision,
            status: processingStatus,
            updatedAt: profile.updatedAt,
          }
        : null,
      items: await enrichMemoryItemsForUi(
        ctx,
        user._id,
        [...activeItems, ...candidateItems, ...reviewItems]
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .slice(0, MAX_PERSONALIZATION_LIST)
      ),
      legacyMemories: legacyMemories.map(
        ({
          _creationTime,
          _id,
          content,
          key,
          scope,
          sourceConversationId,
          updatedAt,
        }) => ({
          _creationTime,
          _id,
          content,
          key,
          scope,
          ...(sourceConversationId ? { sourceConversationId } : {}),
          updatedAt,
        })
      ),
      pendingJobs: queuedJobs.length,
      failedJobs: failedJobs.length,
      historyBackfill: {
        eligible: historyChats.filter((chat) => chat.memoryMode !== "off").length,
        pending: queuedJobs.filter((job) => job.kind === "history_backfill").length,
      },
      degradedReason: !savedMemoryEnabled
        ? ("saved_memory_disabled" as const)
        : processingStatus !== "active"
          ? ("processing_unavailable" as const)
          : null,
    }
  },
})

export const list = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("active"),
        v.literal("candidate"),
        v.literal("needs_review"),
        v.literal("archived"),
        v.literal("removed")
      )
    ),
    projectId: v.optional(v.id("projects")),
  },
  returns: v.array(v2MemoryForUiValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const status = args.status ?? "active"
    const items = args.projectId
      ? await ctx.db
          .query("memoryItems")
          .withIndex("by_project_id_and_status_and_updated_at", (q) =>
            q.eq("projectId", args.projectId).eq("status", status)
          )
          .order("desc")
          .take(MAX_PERSONALIZATION_LIST)
      : await ctx.db
          .query("memoryItems")
          .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
            q.eq("ownerId", user._id).eq("status", status)
          )
          .order("desc")
          .take(MAX_PERSONALIZATION_LIST)
    return await enrichMemoryItemsForUi(
      ctx,
      user._id,
      items.filter((item) => item.ownerId === user._id)
    )
  },
})

export const setHistoryEnabled = mutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    await ctx.db.patch(user._id, {
      memoryHistoryEnabled: args.enabled,
      memoryHistoryRevision: (user.memoryHistoryRevision ?? 0) + 1,
      memoryRevision: (user.memoryRevision ?? 0) + 1,
    })
    if (args.enabled)
      await ctx.scheduler.runAfter(0, internal.memoryHistory.enqueueBackfill, {
        ownerId: user._id,
        now: Date.now(),
      })
    return null
  },
})

export const clearHistoryMemory = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    await ctx.db.patch(user._id, {
      memoryHistoryRevision: (user.memoryHistoryRevision ?? 0) + 1,
    })
    await ctx.scheduler.runAfter(0, internal.memoryHistory.clearForOwner, {
      ownerId: user._id,
    })
    return null
  },
})

export const setProcessingProfile = mutation({
  args: { providerConnectionId: v.id("providerConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const connection = await ctx.db.get(args.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== user._id ||
      !(
        (connection.provider === "openrouter" &&
          connection.authMethod === "oauth") ||
        (connection.provider === "openai" && connection.authMethod === "api_key")
      )
    ) {
      throw new Error("A user-owned OpenAI API key or OpenRouter OAuth connection is required")
    }
    const provider: "openrouter" | "openai" =
      connection.provider === "openrouter" ? "openrouter" : "openai"
    const policy = getMemoryProcessingPolicy(provider)
    const status: "active" | "needs_reauthentication" | "disconnected" =
      connection.status === "connected"
        ? "active"
        : connection.status === "needs_reauthentication"
          ? "needs_reauthentication"
          : "disconnected"
    const existing = await ctx.db
      .query("memoryProcessingProfiles")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", user._id))
      .unique()
    const now = Date.now()
    const profilePatch = {
      providerConnectionId: connection._id,
      provider,
      extractionModel: policy.extractionModel,
      embeddingModel: policy.embeddingModel,
      dimensions: policy.dimensions,
      policyRevision: (existing?.policyRevision ?? 0) + 1,
      status,
      updatedAt: now,
    }
    if (existing) await ctx.db.patch(existing._id, profilePatch)
    else await ctx.db.insert("memoryProcessingProfiles", { ownerId: user._id, ...profilePatch })
    await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
    return null
  },
})

async function assertOwnedMemoryProject(
  ctx: MemoryDatabaseContext,
  ownerId: Id<"users">,
  projectId: Id<"projects"> | undefined
) {
  if (!projectId) return
  const project = await ctx.db.get(projectId)
  if (!project || project.ownerId !== ownerId)
    throw new Error("Project unavailable")
}

export const create = mutation({
  args: {
    canonicalKey: v.string(),
    content: v.string(),
    category: memoryCategoryValidator,
    scope: memoryScopeValidator,
    projectId: v.optional(v.id("projects")),
    pinned: v.optional(v.boolean()),
    confirmSensitive: v.optional(v.boolean()),
  },
  returns: v.id("memoryItems"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    if (!(user.memoryEnabled ?? false)) throw new Error("Saved memory is off")
    await assertOwnedMemoryProject(ctx, user._id, args.projectId)
    if ((args.scope === "project") !== Boolean(args.projectId))
      throw new Error("Project memory scope is invalid")
    const canonicalKey = normalizeCanonicalKey(args.canonicalKey)
    const content = normalizeEditedMemory(canonicalKey, args.content)
    if (isSensitiveMemory(canonicalKey, content) && !args.confirmSensitive)
      throw new Error("Sensitive memory requires explicit confirmation")
    const now = Date.now()
    const scopeKey = getMemoryScopeKey(args.scope, args.projectId)
    const existing = await ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_scope_key_and_canonical_key", (q) =>
        q
          .eq("ownerId", user._id)
          .eq("scopeKey", scopeKey)
          .eq("canonicalKey", canonicalKey)
      )
      .unique()
    const tombstone = await ctx.db
      .query("memoryTombstones")
      .withIndex("by_owner_id_and_key_hash", (q) =>
        q
          .eq("ownerId", user._id)
          .eq(
            "keyHash",
            createMemoryTombstoneHash(user._id, scopeKey, canonicalKey)
          )
      )
      .unique()
    if (tombstone?.expiresAt && tombstone.expiresAt > now)
      throw new Error("Memory key is unavailable until its deletion window expires")
    if (existing)
      throw new Error("A memory with this key already exists")
    const active = await ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
        q.eq("ownerId", user._id).eq("status", "active")
      )
      .order("asc")
      .take(MAX_ACTIVE_MEMORY_ITEMS)
    if (active.length >= MAX_ACTIVE_MEMORY_ITEMS) {
      const evictable = active.find(
        (item) => item.confirmation === "pending" && !item.pinned
      )
      if (!evictable) throw new Error("Memory capacity is full")
      await ctx.db.patch(evictable._id, { status: "archived", updatedAt: now })
    }
    const revision = 1
    const id = await ctx.db.insert("memoryItems", {
      ownerId: user._id,
      ...(args.projectId ? { projectId: args.projectId } : {}),
      scope: args.scope,
      scopeKey,
      category: args.category,
      canonicalKey,
      content,
      status: "active",
      sourceSignal: "manual",
      confirmation: "confirmed",
      pinned: args.pinned ?? false,
      sensitivity: isSensitiveMemory(canonicalKey, content)
        ? "sensitive"
        : "normal",
      revision,
      sourceTimestamp: now,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("memoryVersions", {
      ownerId: user._id,
      memoryItemId: id,
      revision,
      content,
      category: args.category,
      sourceSignal: "manual",
      changedAt: now,
    })
    await ctx.db.insert("memoryEvidence", {
      ownerId: user._id,
      memoryItemId: id,
      sourceSignal: "manual",
      createdAt: now,
    })
    await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
    return id
  },
})

export const confirm = mutation({
  args: {
    memoryItemId: v.id("memoryItems"),
    confirmSensitive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const item = await ctx.db.get(args.memoryItemId)
    if (!item || item.ownerId !== user._id || item.status === "removed")
      throw new Error("Memory unavailable")
    if (item.sensitivity === "sensitive" && !args.confirmSensitive)
      throw new Error("Sensitive memory cannot be confirmed without a separate explicit save")
    const now = Date.now()
    if (item.status !== "active") {
      const active = await ctx.db
        .query("memoryItems")
        .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
          q.eq("ownerId", user._id).eq("status", "active")
        )
        .order("asc")
        .take(MAX_ACTIVE_MEMORY_ITEMS)
      if (active.length >= MAX_ACTIVE_MEMORY_ITEMS) {
        const evictable = active.find(
          (activeItem) =>
            activeItem.confirmation === "pending" && !activeItem.pinned
        )
        if (!evictable) throw new Error("Memory capacity is full")
        await ctx.db.patch(evictable._id, {
          status: "archived",
          updatedAt: now,
        })
      }
    }
    await ctx.db.patch(item._id, {
      status: "active",
      confirmation: "confirmed",
      updatedAt: now,
    })
    await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
    return null
  },
})

export const setPinned = mutation({
  args: { memoryItemId: v.id("memoryItems"), pinned: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const item = await ctx.db.get(args.memoryItemId)
    if (!item || item.ownerId !== user._id || item.status === "removed")
      throw new Error("Memory unavailable")
    await ctx.db.patch(item._id, { pinned: args.pinned, updatedAt: Date.now() })
    await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
    return null
  },
})

export const undoRemove = mutation({
  args: { memoryItemId: v.id("memoryItems") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const item = await ctx.db.get(args.memoryItemId)
    const now = Date.now()
    if (
      !item ||
      item.ownerId !== user._id ||
      item.status !== "removed" ||
      !item.undoExpiresAt ||
      item.undoExpiresAt < now
    ) {
      throw new Error("Memory can no longer be restored")
    }
    const tombstone = await ctx.db
      .query("memoryTombstones")
      .withIndex("by_owner_id_and_key_hash", (q) =>
        q
          .eq("ownerId", user._id)
          .eq(
            "keyHash",
            createMemoryTombstoneHash(user._id, item.scopeKey, item.canonicalKey)
          )
      )
      .unique()
    if (tombstone) await ctx.db.delete(tombstone._id)
    await ctx.db.patch(item._id, {
      status: "active",
      removedAt: undefined,
      undoExpiresAt: undefined,
      updatedAt: now,
    })
    await ctx.db.patch(user._id, { memoryRevision: (user.memoryRevision ?? 0) + 1 })
    return null
  },
})

export const retryProcessing = mutation({
  args: { jobId: v.optional(v.id("memoryJobs")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const jobs = args.jobId
      ? [await ctx.db.get(args.jobId)]
      : await ctx.db
          .query("memoryJobs")
          .withIndex("by_owner_id_and_status_and_next_attempt_at", (q) =>
            q.eq("ownerId", user._id).eq("status", "failed")
          )
          .take(20)
    const now = Date.now()
    for (const job of jobs) {
      if (!job || job.ownerId !== user._id) {
        if (args.jobId) throw new Error("Memory job unavailable")
        continue
      }
      if (job.status !== "failed") continue
      await ctx.db.patch(job._id, {
        status: "queued",
        errorCode: undefined,
        nextAttemptAt: now,
        updatedAt: now,
      })
      await ctx.scheduler.runAfter(
        0,
        job.kind === "history_backfill"
          ? internal.memoryActions.processHistoryJob
          : internal.memoryActions.processCapture,
        { jobId: job._id }
      )
    }
    return null
  },
})

export const listResponseSources = query({
  args: { responseMessageId: v.id("messages") },
  returns: v.array(
    v.object({
      referenceId: v.id("responseMemoryReferences"),
      memoryItemId: v.optional(v.id("memoryItems")),
      summaryId: v.optional(v.id("conversationMemorySummaries")),
      feedback: v.optional(
        v.union(v.literal("helpful"), v.literal("incorrect"), v.literal("dont_use"))
      ),
      createdAt: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const response = await ctx.db.get(args.responseMessageId)
    if (!response) throw new Error("Response unavailable")
    const conversation = await ctx.db.get(response.conversationId)
    if (!conversation || conversation.ownerId !== user._id)
      throw new Error("Response unavailable")
    const references = await ctx.db
      .query("responseMemoryReferences")
      .withIndex("by_response_message_id", (q) =>
        q.eq("responseMessageId", response._id)
      )
      .take(MAX_RETRIEVED_MEMORIES + 2)
    return references.map((reference) => ({
      referenceId: reference._id,
      ...(reference.memoryItemId ? { memoryItemId: reference.memoryItemId } : {}),
      ...(reference.summaryId ? { summaryId: reference.summaryId } : {}),
      ...(reference.feedback ? { feedback: reference.feedback } : {}),
      createdAt: reference.createdAt,
    }))
  },
})

export const submitFeedback = mutation({
  args: {
    referenceId: v.id("responseMemoryReferences"),
    feedback: v.union(
      v.literal("helpful"),
      v.literal("incorrect"),
      v.literal("dont_use")
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const reference = await ctx.db.get(args.referenceId)
    if (!reference || reference.ownerId !== user._id)
      throw new Error("Memory reference unavailable")
    await ctx.db.patch(reference._id, { feedback: args.feedback })
    if (args.feedback === "dont_use" && reference.memoryItemId) {
      const item = await ctx.db.get(reference.memoryItemId)
      if (item?.ownerId === user._id) {
        const now = Date.now()
        const keyHash = createMemoryTombstoneHash(
          user._id,
          item.scopeKey,
          item.canonicalKey
        )
        const tombstone = await ctx.db
          .query("memoryTombstones")
          .withIndex("by_owner_id_and_key_hash", (q) =>
            q.eq("ownerId", user._id).eq("keyHash", keyHash)
          )
          .unique()
        if (tombstone)
          await ctx.db.patch(tombstone._id, {
            expiresAt: now + MEMORY_TOMBSTONE_RETENTION_MS,
          })
        else
          await ctx.db.insert("memoryTombstones", {
            ownerId: user._id,
            keyHash,
            createdAt: now,
            expiresAt: now + MEMORY_TOMBSTONE_RETENTION_MS,
          })
        const documents = await ctx.db
          .query("memorySearchDocuments")
          .withIndex("by_memory_item_id_and_profile_revision", (q) =>
            q.eq("memoryItemId", item._id)
          )
          .take(10)
        for (const document of documents) await ctx.db.delete(document._id)
        await ctx.db.patch(item._id, {
          status: "removed",
          removedAt: now,
          undoExpiresAt: now + MEMORY_UNDO_WINDOW_MS,
          updatedAt: now,
        })
      }
    }
    return null
  },
})
