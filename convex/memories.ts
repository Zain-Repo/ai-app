import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { getCurrentUser } from "./authHelpers"
import { normalizeEditedMemory } from "./memoryPolicy"

const MAX_MEMORIES_PER_USER = 100
const MAX_RETRIEVED_MEMORIES = 8

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
  args: { memoryId: v.id("memories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
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
  args: { content: v.string(), memoryId: v.id("memories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
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
      if (candidate.kind === "fact" && !candidate.embedding) continue
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
