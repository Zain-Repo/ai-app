import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"

const terminalErrorValidator = v.union(
  v.literal("provider_required"),
  v.literal("needs_reauthentication"),
  v.literal("profile_changed"),
  v.literal("stale_source"),
  v.literal("processing_failed")
)

const MAX_ATTEMPTS = 5

export const claim = internalMutation({
  args: { jobId: v.id("memoryJobs") },
  returns: v.union(
    v.object({
      jobId: v.id("memoryJobs"),
      ownerId: v.id("users"),
      kind: v.union(
        v.literal("capture"),
        v.literal("embed"),
        v.literal("history_backfill")
      ),
      sourceConversationId: v.optional(v.id("conversations")),
      sourceMessageId: v.optional(v.id("messages")),
      memoryItemId: v.optional(v.id("memoryItems")),
      profileId: v.optional(v.id("memoryProcessingProfiles")),
      profileRevision: v.number(),
      policyRevision: v.number(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    const now = Date.now()
    if (!job || job.status !== "queued" || job.nextAttemptAt > now) return null
    const profile = job.profileId ? await ctx.db.get(job.profileId) : null
    const connection = profile
      ? await ctx.db.get(profile.providerConnectionId)
      : null
    if (
      !profile ||
      profile.ownerId !== job.ownerId ||
      profile.policyRevision !== job.profileRevision ||
      profile.status !== "active" ||
      !connection ||
      connection.ownerId !== job.ownerId ||
      connection.status !== "connected"
    ) {
      if (profile && connection?.status !== "connected")
        await ctx.db.patch(profile._id, {
          status:
            connection?.status === "needs_reauthentication"
              ? "needs_reauthentication"
              : "disconnected",
          updatedAt: now,
        })
      await ctx.db.patch(job._id, {
        status: "cancelled",
        errorCode: "profile_changed",
        updatedAt: now,
      })
      return null
    }
    await ctx.db.patch(job._id, {
      status: "running",
      attempts: job.attempts + 1,
      updatedAt: now,
    })
    return {
      jobId: job._id,
      ownerId: job.ownerId,
      kind: job.kind,
      ...(job.sourceConversationId
        ? { sourceConversationId: job.sourceConversationId }
        : {}),
      ...(job.sourceMessageId ? { sourceMessageId: job.sourceMessageId } : {}),
      ...(job.memoryItemId ? { memoryItemId: job.memoryItemId } : {}),
      ...(job.profileId ? { profileId: job.profileId } : {}),
      profileRevision: job.profileRevision,
      policyRevision: job.policyRevision,
    }
  },
})

export const complete = internalMutation({
  args: { jobId: v.id("memoryJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job || job.status !== "running") return null
    await ctx.db.patch(job._id, {
      status: "complete",
      updatedAt: Date.now(),
    })
    return null
  },
})

export const fail = internalMutation({
  args: { jobId: v.id("memoryJobs"), errorCode: terminalErrorValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job || job.status !== "running") return null
    const now = Date.now()
    const terminal =
      job.attempts >= MAX_ATTEMPTS ||
      args.errorCode === "profile_changed" ||
      args.errorCode === "stale_source"
    const retryDelay = 2 ** job.attempts * 1_000
    await ctx.db.patch(job._id, {
      status: terminal ? "failed" : "queued",
      errorCode: args.errorCode,
      nextAttemptAt: terminal ? now : now + retryDelay,
      updatedAt: now,
    })
    if (!terminal) {
      const nextAction =
        job.kind === "history_backfill"
          ? internal.memoryActions.processHistoryJob
          : job.kind === "embed"
            ? internal.memoryActions.processEmbedding
            : internal.memoryActions.processCapture
      await ctx.scheduler.runAfter(retryDelay, nextAction, { jobId: job._id })
    }
    return null
  },
})
