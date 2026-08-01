import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { enqueueMemoryEmbedding } from "./memories"

const BATCH_SIZE = 100

// Migration leaves legacy embeddings unread by v2: only fresh, profile-bound
// memorySearchDocuments participate in semantic retrieval.
export const migrateOwner = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.object({ migrated: v.number(), remaining: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("memoryMigrationRuns")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
      .unique()
    const legacyPage = await ctx.db
      .query("memories")
      .withIndex("by_owner_id_and_updated_at", (q) => q.eq("ownerId", args.ownerId))
      .paginate({ numItems: BATCH_SIZE, cursor: run?.cursor ?? null })
    const legacy = legacyPage.page
    let migrated = 0
    const now = Date.now()
    for (const memory of legacy) {
      const existing = await ctx.db
        .query("memoryItems")
        .withIndex("by_owner_id_and_scope_key_and_canonical_key", (q) =>
          q
            .eq("ownerId", args.ownerId)
            .eq("scopeKey", memory.scopeKey)
            .eq("canonicalKey", memory.key)
        )
        .take(BATCH_SIZE + 1)
      if (existing.some((item) => item.status !== "removed")) continue
      const sourceSignal = memory.sourceMessageId
        ? "direct_statement"
        : "manual"
      const itemId = await ctx.db.insert("memoryItems", {
        ownerId: args.ownerId,
        ...(memory.projectId ? { projectId: memory.projectId } : {}),
        scope: memory.scope,
        scopeKey: memory.scopeKey,
        category: memory.kind === "preference" ? "preference" : "fact",
        canonicalKey: memory.key,
        content: memory.content,
        status: "active",
        sourceSignal,
        confirmation: "confirmed",
        pinned: sourceSignal === "manual",
        sensitivity: "normal",
        revision: 1,
        ...(memory.sourceConversationId
          ? { sourceConversationId: memory.sourceConversationId }
          : {}),
        ...(memory.sourceMessageId ? { sourceMessageId: memory.sourceMessageId } : {}),
        sourceTimestamp: memory.sourceTimestamp,
        createdAt: memory._creationTime,
        updatedAt: memory.updatedAt,
      })
      await ctx.db.insert("memoryVersions", {
        ownerId: args.ownerId,
        memoryItemId: itemId,
        revision: 1,
        content: memory.content,
        category: memory.kind === "preference" ? "preference" : "fact",
        sourceSignal,
        changedAt: now,
      })
      await ctx.db.insert("memoryEvidence", {
        ownerId: args.ownerId,
        memoryItemId: itemId,
        ...(memory.sourceConversationId
          ? { sourceConversationId: memory.sourceConversationId }
          : {}),
        ...(memory.sourceMessageId ? { sourceMessageId: memory.sourceMessageId } : {}),
        sourceSignal,
        createdAt: now,
      })
      if (sourceSignal === "direct_statement")
        await enqueueMemoryEmbedding(ctx, args.ownerId, itemId)
      migrated += 1
    }
    const remaining = !legacyPage.isDone
    if (run)
      await ctx.db.patch(run._id, {
        migratedCount: run.migratedCount + migrated,
        ...(remaining ? { cursor: legacyPage.continueCursor } : { cursor: undefined }),
        ...(remaining ? {} : { completedAt: now }),
      })
    else
      await ctx.db.insert("memoryMigrationRuns", {
        ownerId: args.ownerId,
        startedAt: now,
        ...(remaining ? { cursor: legacyPage.continueCursor } : {}),
        ...(remaining ? {} : { completedAt: now }),
        migratedCount: migrated,
      })
    if (remaining)
      await ctx.scheduler.runAfter(0, internal.memoryMigration.migrateOwner, args)
    return { migrated, remaining }
  },
})

export const enqueueOwnerMigration = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.memoryMigration.migrateOwner, args)
    return null
  },
})
