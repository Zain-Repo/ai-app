import { v } from "convex/values"

import { internalMutation } from "./_generated/server"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { MutationCtx } from "./_generated/server"
import {
  MEMORY_REVIEW_AFTER_MS,
} from "./memoryTypes"

const MAX_RETENTION_BATCH = 100
const OWNER_SWEEP_BATCH = 25
const OWNER_SWEEP_NAME = "hourly-owner-retention"

async function deleteMemoryItemArtifacts(
  ctx: MutationCtx,
  item: Doc<"memoryItems">
) {
  const [documents, evidence, versions, references] = await Promise.all([
    ctx.db
      .query("memorySearchDocuments")
      .withIndex("by_memory_item_id_and_profile_revision", (q) =>
        q.eq("memoryItemId", item._id)
      )
      .take(MAX_RETENTION_BATCH),
    ctx.db
      .query("memoryEvidence")
      .withIndex("by_memory_item_id_and_created_at", (q) =>
        q.eq("memoryItemId", item._id)
      )
      .take(MAX_RETENTION_BATCH),
    ctx.db
      .query("memoryVersions")
      .withIndex("by_memory_item_id_and_revision", (q) =>
        q.eq("memoryItemId", item._id)
      )
      .take(MAX_RETENTION_BATCH),
    ctx.db
      .query("responseMemoryReferences")
      .withIndex("by_memory_item_id", (q) => q.eq("memoryItemId", item._id))
      .take(MAX_RETENTION_BATCH),
  ])
  for (const row of [...documents, ...evidence, ...versions, ...references])
    await ctx.db.delete(row._id)
  if (
    documents.length === MAX_RETENTION_BATCH ||
    evidence.length === MAX_RETENTION_BATCH ||
    versions.length === MAX_RETENTION_BATCH ||
    references.length === MAX_RETENTION_BATCH
  ) {
    return false
  }
  await ctx.db.delete(item._id)
  return true
}

async function runOwnerRetention(
  ctx: MutationCtx,
  ownerId: Doc<"users">["_id"],
  now: number
) {
  const [candidates, active, removed] = await Promise.all([
    ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "candidate")
      )
      .take(MAX_RETENTION_BATCH),
    ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "active")
      )
      .take(MAX_RETENTION_BATCH),
    ctx.db
      .query("memoryItems")
      .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
        q.eq("ownerId", ownerId).eq("status", "removed")
      )
      .take(MAX_RETENTION_BATCH),
  ])
  let expiredCandidates = 0
  let reviews = 0
  let purged = 0
  for (const item of candidates) {
    if (item.expiresAt && item.expiresAt <= now) {
      await ctx.db.patch(item._id, { status: "archived", updatedAt: now })
      expiredCandidates += 1
    }
  }
  for (const item of active) {
    if (
      item.confirmation === "pending" &&
      !item.pinned &&
      now - (item.lastUsedAt ?? item.updatedAt) >= MEMORY_REVIEW_AFTER_MS
    ) {
      await ctx.db.patch(item._id, { status: "needs_review", updatedAt: now })
      reviews += 1
    }
  }
  for (const item of removed) {
    if (!item.undoExpiresAt || item.undoExpiresAt > now) continue
    if (await deleteMemoryItemArtifacts(ctx, item)) purged += 1
  }
  return { candidates: expiredCandidates, reviews, purged }
}

// Bounded and idempotent: a cron or account-erasure workflow can call this
// repeatedly without scanning unbounded owner data in one transaction.
export const run = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({
    tombstones: v.number(),
    candidates: v.number(),
    reviews: v.number(),
    purged: v.number(),
  }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    const tombstones = await ctx.db
      .query("memoryTombstones")
      .withIndex("by_expires_at", (q) => q.lt("expiresAt", now))
      .take(MAX_RETENTION_BATCH)
    for (const tombstone of tombstones) await ctx.db.delete(tombstone._id)
    const sweep = await ctx.db
      .query("memoryRetentionSweeps")
      .withIndex("by_name", (q) => q.eq("name", OWNER_SWEEP_NAME))
      .unique()
    const ownerPage = await ctx.db
      .query("users")
      .withIndex("by_last_seen_at", (q) => q)
      .paginate({
        cursor: sweep?.cursor ?? null,
        numItems: OWNER_SWEEP_BATCH,
      })
    let candidates = 0
    let reviews = 0
    let purged = 0
    for (const owner of ownerPage.page) {
      const result = await runOwnerRetention(ctx, owner._id, now)
      candidates += result.candidates
      reviews += result.reviews
      purged += result.purged
    }
    const cursorPatch = {
      ...(ownerPage.isDone
        ? { cursor: undefined }
        : { cursor: ownerPage.continueCursor }),
      updatedAt: now,
    }
    if (sweep) await ctx.db.patch(sweep._id, cursorPatch)
    else
      await ctx.db.insert("memoryRetentionSweeps", {
        name: OWNER_SWEEP_NAME,
        ...cursorPatch,
      })
    return { tombstones: tombstones.length, candidates, reviews, purged }
  },
})

export const runForOwner = internalMutation({
  args: { ownerId: v.id("users"), now: v.optional(v.number()) },
  returns: v.object({ candidates: v.number(), reviews: v.number(), purged: v.number() }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now()
    return await runOwnerRetention(ctx, args.ownerId, now)
  },
})

export const eraseProjectMemoryArtifacts = internalMutation({
  args: { ownerId: v.id("users"), projectId: v.id("projects") },
  returns: v.object({ remaining: v.boolean() }),
  handler: async (ctx, args) => {
    const statuses = ["active", "candidate", "needs_review", "archived", "removed"] as const
    const itemBatches = await Promise.all(
      statuses.map(async (status) =>
        await ctx.db
          .query("memoryItems")
          .withIndex("by_project_id_and_status_and_updated_at", (q) =>
            q.eq("projectId", args.projectId).eq("status", status)
          )
          .take(MAX_RETENTION_BATCH)
      )
    )
    for (const item of itemBatches.flat())
      if (item.ownerId === args.ownerId) await deleteMemoryItemArtifacts(ctx, item)
    const summaries = await ctx.db
      .query("conversationMemorySummaries")
      .withIndex("by_owner_id_and_updated_at", (q) => q.eq("ownerId", args.ownerId))
      .take(MAX_RETENTION_BATCH)
    for (const summary of summaries)
      if (summary.projectId === args.projectId) await ctx.db.delete(summary._id)
    const remaining = itemBatches.some(
      (items) => items.length === MAX_RETENTION_BATCH
    )
    if (remaining)
      await ctx.scheduler.runAfter(
        0,
        internal.memoryRetention.eraseProjectMemoryArtifacts,
        args
      )
    return { remaining }
  },
})

export const eraseOwnerMemoryArtifacts = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.object({ remaining: v.boolean() }),
  handler: async (ctx, args) => {
    const statuses = ["active", "candidate", "needs_review", "archived", "removed"] as const
    let remaining = false
    for (const status of statuses) {
      const items = await ctx.db
        .query("memoryItems")
        .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
          q.eq("ownerId", args.ownerId).eq("status", status)
        )
        .take(MAX_RETENTION_BATCH)
      for (const item of items) await deleteMemoryItemArtifacts(ctx, item)
      remaining ||= items.length === MAX_RETENTION_BATCH
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
            .take(MAX_RETENTION_BATCH)
        )
      )
    ).flat()
    const [summaries, profiles, tombstones, references] = await Promise.all([
      ctx.db
        .query("conversationMemorySummaries")
        .withIndex("by_owner_id_and_updated_at", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_RETENTION_BATCH),
      ctx.db
        .query("memoryProcessingProfiles")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_RETENTION_BATCH),
      ctx.db
        .query("memoryTombstones")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_RETENTION_BATCH),
      ctx.db
        .query("responseMemoryReferences")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", args.ownerId))
        .take(MAX_RETENTION_BATCH),
    ])
    for (const row of [
      ...summaries,
      ...profiles,
      ...tombstones,
      ...references,
      ...jobs,
    ])
      await ctx.db.delete(row._id)
    const hasRemaining =
      remaining ||
      summaries.length === MAX_RETENTION_BATCH ||
      tombstones.length === MAX_RETENTION_BATCH ||
      references.length === MAX_RETENTION_BATCH ||
      jobs.length >= MAX_RETENTION_BATCH
    if (hasRemaining)
      await ctx.scheduler.runAfter(
        0,
        internal.memoryRetention.eraseOwnerMemoryArtifacts,
        args
      )
    return {
      remaining:
        hasRemaining,
    }
  },
})

// Clerk's verified account-deletion handler should call this internal mutation
// with the server-resolved owner id before deleting the user record.
export const enqueueOwnerMemoryErasure = internalMutation({
  args: { ownerId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.memoryRetention.eraseOwnerMemoryArtifacts,
      args
    )
    return null
  },
})

export const eraseConversationMemoryArtifacts = internalMutation({
  args: { ownerId: v.id("users"), conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [summary, references] = await Promise.all([
      ctx.db
        .query("conversationMemorySummaries")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
        .unique(),
      ctx.db
        .query("responseMemoryReferences")
        .withIndex("by_conversation_id", (q) => q.eq("conversationId", args.conversationId))
        .take(MAX_RETENTION_BATCH),
    ])
    if (summary?.ownerId === args.ownerId) await ctx.db.delete(summary._id)
    for (const reference of references)
      if (reference.ownerId === args.ownerId) await ctx.db.delete(reference._id)
    return null
  },
})
