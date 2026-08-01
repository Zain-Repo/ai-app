import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalMutation, internalQuery } from "./_generated/server"

const MAX_BACKFILL_CONVERSATIONS = 100
const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1_000

export const enqueueBackfill = internalMutation({
  args: { ownerId: v.id("users"), now: v.number() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const owner = await ctx.db.get(args.ownerId)
    if (!owner?.memoryHistoryEnabled) return 0
    const profile = await ctx.db
      .query("memoryProcessingProfiles")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
      .unique()
    if (!profile || profile.status !== "active") return 0
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_owner_status_updated_at", (q) =>
        q.eq("ownerId", args.ownerId).eq("status", "active")
      )
      .order("desc")
      .take(MAX_BACKFILL_CONVERSATIONS)
    let queued = 0
    for (const conversation of conversations) {
      if (
        conversation.updatedAt < args.now - HISTORY_WINDOW_MS ||
        (conversation.memoryMode ?? "standard") !== "standard"
      ) {
        continue
      }
      const existingSummary = await ctx.db
        .query("conversationMemorySummaries")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
        .unique()
      if (existingSummary) continue
      const existingJob = await ctx.db
        .query("memoryJobs")
        .withIndex("by_source_conversation_id_and_kind", (q) =>
          q
            .eq("sourceConversationId", conversation._id)
            .eq("kind", "history_backfill")
        )
        .take(1)
      if (existingJob.length) continue
      const jobId = await ctx.db.insert("memoryJobs", {
        ownerId: args.ownerId,
        kind: "history_backfill",
        sourceConversationId: conversation._id,
        profileId: profile._id,
        profileRevision: profile.policyRevision,
        policyRevision: profile.policyRevision,
        historyRevision: owner.memoryHistoryRevision ?? 0,
        status: "queued",
        attempts: 0,
        nextAttemptAt: args.now,
        createdAt: args.now,
        updatedAt: args.now,
      })
      await ctx.scheduler.runAfter(0, internal.memoryActions.processHistoryJob, {
        jobId,
      })
      queued += 1
    }
    return queued
  },
})

export const getHistoryProcessingContext = internalQuery({
  args: { jobId: v.id("memoryJobs") },
  returns: v.union(
    v.object({
      ciphertext: v.string(),
      iv: v.string(),
      connectionId: v.id("providerConnections"),
      provider: v.union(v.literal("openrouter"), v.literal("openai")),
      extractionModel: v.string(),
      ownerId: v.id("users"),
      conversationId: v.id("conversations"),
      historyRevision: v.number(),
      sourceMessageId: v.optional(v.id("messages")),
      transcript: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (
      !job ||
      job.kind !== "history_backfill" ||
      job.status !== "running" ||
      !job.sourceConversationId ||
      !job.profileId
    ) {
      return null
    }
    const [owner, conversation, profile] = await Promise.all([
      ctx.db.get(job.ownerId),
      ctx.db.get(job.sourceConversationId),
      ctx.db.get(job.profileId),
    ])
    if (
      !owner?.memoryHistoryEnabled ||
      job.historyRevision !== (owner.memoryHistoryRevision ?? 0) ||
      !conversation ||
      conversation.ownerId !== job.ownerId ||
      (conversation.memoryMode ?? "standard") !== "standard" ||
      !profile ||
      profile.ownerId !== job.ownerId ||
      profile.status !== "active" ||
      profile.policyRevision !== job.profileRevision
    ) {
      return null
    }
    const connection = await ctx.db.get(profile.providerConnectionId)
    if (!connection || connection.status !== "connected") return null
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (q) => q.eq("connectionId", connection._id))
      .unique()
    if (!credential) return null
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .take(20)
    const sourceMessage = messages.find(
      (message) => message.role === "user" && message.status === "complete"
    )
    return {
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      connectionId: connection._id,
      provider: profile.provider,
      extractionModel: profile.extractionModel,
      ownerId: job.ownerId,
      conversationId: conversation._id,
      historyRevision: job.historyRevision ?? 0,
      ...(sourceMessage ? { sourceMessageId: sourceMessage._id } : {}),
      transcript: messages
        .reverse()
        .filter((message) => message.status === "complete")
        .map((message) => `${message.role}: ${message.content}`)
        .join("\n")
        .slice(0, 12_000),
    }
  },
})

export const applySummary = internalMutation({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    historyRevision: v.number(),
    sourceMessageId: v.optional(v.id("messages")),
    content: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const [owner, conversation] = await Promise.all([
      ctx.db.get(args.ownerId),
      ctx.db.get(args.conversationId),
    ])
    if (
      !owner?.memoryHistoryEnabled ||
      (owner.memoryHistoryRevision ?? 0) !== args.historyRevision ||
      !conversation ||
      conversation.ownerId !== args.ownerId ||
      (conversation.memoryMode ?? "standard") !== "standard"
    ) {
      return false
    }
    const content = args.content.trim().replace(/\s+/g, " ").slice(0, 1_500)
    if (!content) return false
    const existing = await ctx.db
      .query("conversationMemorySummaries")
      .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversation._id))
      .unique()
    const now = Date.now()
    if (existing) {
      await ctx.db.patch(existing._id, {
        content,
        ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
        revision: existing.revision + 1,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("conversationMemorySummaries", {
        ownerId: args.ownerId,
        conversationId: conversation._id,
        ...(conversation.projectId ? { projectId: conversation.projectId } : {}),
        content,
        ...(args.sourceMessageId ? { sourceMessageId: args.sourceMessageId } : {}),
        revision: 1,
        updatedAt: now,
      })
    }
    return true
  },
})

export const clearForOwner = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const summaries = await ctx.db
      .query("conversationMemorySummaries")
      .withIndex("by_owner_id_and_updated_at", (q) => q.eq("ownerId", args.ownerId))
      .take(MAX_BACKFILL_CONVERSATIONS)
    for (const summary of summaries) {
      const references = await ctx.db
        .query("responseMemoryReferences")
        .withIndex("by_summary_id", (q) => q.eq("summaryId", summary._id))
        .take(MAX_BACKFILL_CONVERSATIONS)
      for (const reference of references) await ctx.db.delete(reference._id)
      await ctx.db.delete(summary._id)
    }
    const jobStatuses = ["queued", "running", "failed", "complete", "cancelled"] as const
    const jobs = (
      await Promise.all(
        jobStatuses.map(async (status) =>
          await ctx.db
            .query("memoryJobs")
            .withIndex("by_owner_id_and_status_and_next_attempt_at", (q) =>
              q.eq("ownerId", args.ownerId).eq("status", status)
            )
            .take(MAX_BACKFILL_CONVERSATIONS)
        )
      )
    ).flat()
    for (const job of jobs)
      if (job.kind === "history_backfill")
        await ctx.db.delete(job._id)
    const remaining = summaries.length === MAX_BACKFILL_CONVERSATIONS
    if (remaining)
      await ctx.scheduler.runAfter(0, internal.memoryHistory.clearForOwner, args)
    return remaining
  },
})
