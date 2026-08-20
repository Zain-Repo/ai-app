import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import { mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { getCurrentUser } from "./authHelpers"
import { enqueueMemoryEmbedding } from "./memories"
import { isSafeDurableMemory, normalizeEditedMemory } from "./memoryPolicy"
import {
  createMemoryTombstoneHash,
  getMemoryScopeKey,
  MAX_ACTIVE_MEMORY_ITEMS,
} from "./memoryTypes"

const MAX_CONVERSATION_RESPONSE_FEEDBACK = 200
const MAX_FEEDBACK_BULLETS = 5
const MAX_FEEDBACK_EXCERPT_LENGTH = 120

const positiveFeedbackKey = "workstyle.response_likes"
const negativeFeedbackKey = "workstyle.response_dislikes"

const assistantResponseFeedbackValidator = v.object({
  responseMessageId: v.id("messages"),
  rating: v.union(v.literal("positive"), v.literal("negative")),
  updatedAt: v.number(),
})

export type AssistantResponseFeedbackRating = "negative" | "positive"

function normalizeCanonicalKey(value: string) {
  const key = value.trim().toLowerCase()
  if (!/^[a-z][a-z0-9_.-]{0,79}$/.test(key))
    throw new Error("Memory key is invalid")
  return key
}

function truncateFeedbackExcerpt(content: string) {
  const normalized = content.trim().replace(/\s+/g, " ")
  if (normalized.length <= MAX_FEEDBACK_EXCERPT_LENGTH) return normalized
  return `${normalized.slice(0, MAX_FEEDBACK_EXCERPT_LENGTH - 1).trimEnd()}…`
}

function buildFeedbackBullet(
  rating: AssistantResponseFeedbackRating,
  content: string
) {
  const excerpt = truncateFeedbackExcerpt(content)
  return rating === "positive"
    ? `Liked this response style: ${excerpt}`
    : `Disliked this response style: ${excerpt}`
}

function splitFeedbackBullets(content: string) {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/•\s+/))
    .map((line) => line.trim())
    .filter(Boolean)
}

function mergeFeedbackBullets(existingContent: string | undefined, bullet: string) {
  const bullets = existingContent ? splitFeedbackBullets(existingContent) : []
  const nextBullets = [bullet, ...bullets.filter((item) => item !== bullet)].slice(
    0,
    MAX_FEEDBACK_BULLETS
  )
  return nextBullets.join("\n")
}

async function upsertFeedbackMemory(
  ctx: MutationCtx,
  args: {
    owner: Doc<"users">
    conversation: Doc<"conversations">
    responseMessage: Doc<"messages">
    rating: AssistantResponseFeedbackRating
  }
) {
  if (!(args.owner.memoryEnabled ?? false)) return
  if ((args.conversation.memoryMode ?? "standard") !== "standard") return

  const canonicalKey = normalizeCanonicalKey(
    args.rating === "positive" ? positiveFeedbackKey : negativeFeedbackKey
  )
  const bullet = buildFeedbackBullet(args.rating, args.responseMessage.content)
  if (!isSafeDurableMemory(canonicalKey, bullet)) return

  const scopeKey = getMemoryScopeKey("user")
  const now = Date.now()
  const sameKeyItems = await ctx.db
    .query("memoryItems")
    .withIndex("by_owner_id_and_scope_key_and_canonical_key", (q) =>
      q
        .eq("ownerId", args.owner._id)
        .eq("scopeKey", scopeKey)
        .eq("canonicalKey", canonicalKey)
    )
    .take(MAX_ACTIVE_MEMORY_ITEMS + 1)
  const existing = sameKeyItems.find((item) => item.status !== "removed")
  const tombstone = await ctx.db
    .query("memoryTombstones")
    .withIndex("by_owner_id_and_key_hash", (q) =>
      q
        .eq("ownerId", args.owner._id)
        .eq(
          "keyHash",
          createMemoryTombstoneHash(args.owner._id, scopeKey, canonicalKey)
        )
    )
    .unique()
  if (tombstone?.expiresAt && tombstone.expiresAt > now) return

  const mergedContent = normalizeEditedMemory(
    canonicalKey,
    mergeFeedbackBullets(existing?.content, bullet)
  )

  if (existing) {
    const revision = existing.revision + 1
    await ctx.db.patch(existing._id, {
      content: mergedContent,
      status: "active",
      sourceSignal: "manual",
      confirmation: "confirmed",
      category: "workstyle",
      revision,
      sourceConversationId: args.conversation._id,
      sourceMessageId: args.responseMessage._id,
      sourceTimestamp: now,
      updatedAt: now,
    })
    await ctx.db.insert("memoryVersions", {
      ownerId: args.owner._id,
      memoryItemId: existing._id,
      revision,
      content: mergedContent,
      category: "workstyle",
      sourceSignal: "manual",
      changedAt: now,
    })
    await ctx.db.insert("memoryEvidence", {
      ownerId: args.owner._id,
      memoryItemId: existing._id,
      sourceConversationId: args.conversation._id,
      sourceMessageId: args.responseMessage._id,
      sourceSignal: "manual",
      note:
        args.rating === "positive"
          ? "Assistant response marked helpful"
          : "Assistant response marked unhelpful",
      createdAt: now,
    })
    await enqueueMemoryEmbedding(ctx, args.owner._id, existing._id)
    await ctx.db.patch(args.owner._id, {
      memoryRevision: (args.owner.memoryRevision ?? 0) + 1,
    })
    return
  }

  const active = await ctx.db
    .query("memoryItems")
    .withIndex("by_owner_id_and_status_and_updated_at", (q) =>
      q.eq("ownerId", args.owner._id).eq("status", "active")
    )
    .order("asc")
    .take(MAX_ACTIVE_MEMORY_ITEMS)
  if (active.length >= MAX_ACTIVE_MEMORY_ITEMS) {
    const evictable = active.find(
      (item) => item.confirmation === "pending" && !item.pinned
    )
    if (!evictable) return
    await ctx.db.patch(evictable._id, { status: "archived", updatedAt: now })
  }

  const revision = 1
  const memoryItemId = await ctx.db.insert("memoryItems", {
    ownerId: args.owner._id,
    scope: "user",
    scopeKey,
    category: "workstyle",
    canonicalKey,
    content: mergedContent,
    status: "active",
    sourceSignal: "manual",
    confirmation: "confirmed",
    pinned: false,
    sensitivity: "normal",
    revision,
    sourceConversationId: args.conversation._id,
    sourceMessageId: args.responseMessage._id,
    sourceTimestamp: now,
    createdAt: now,
    updatedAt: now,
  })
  await ctx.db.insert("memoryVersions", {
    ownerId: args.owner._id,
    memoryItemId,
    revision,
    content: mergedContent,
    category: "workstyle",
    sourceSignal: "manual",
    changedAt: now,
  })
  await ctx.db.insert("memoryEvidence", {
    ownerId: args.owner._id,
    memoryItemId,
    sourceConversationId: args.conversation._id,
    sourceMessageId: args.responseMessage._id,
    sourceSignal: "manual",
    note:
      args.rating === "positive"
        ? "Assistant response marked helpful"
        : "Assistant response marked unhelpful",
    createdAt: now,
  })
  await enqueueMemoryEmbedding(ctx, args.owner._id, memoryItemId)
  await ctx.db.patch(args.owner._id, {
    memoryRevision: (args.owner.memoryRevision ?? 0) + 1,
  })
}

export const listConversation = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(assistantResponseFeedbackValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const conversation = await ctx.db.get(args.conversationId)
    if (!conversation || conversation.ownerId !== user._id)
      throw new Error("Conversation unavailable")

    const feedback = await ctx.db
      .query("assistantResponseFeedback")
      .withIndex("by_conversation_id", (q) =>
        q.eq("conversationId", conversation._id)
      )
      .take(MAX_CONVERSATION_RESPONSE_FEEDBACK)

    return feedback.map(({ responseMessageId, rating, updatedAt }) => ({
      responseMessageId,
      rating,
      updatedAt,
    }))
  },
})

export const submit = mutation({
  args: {
    conversationId: v.id("conversations"),
    responseMessageId: v.id("messages"),
    rating: v.union(v.literal("positive"), v.literal("negative"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const [conversation, responseMessage] = await Promise.all([
      ctx.db.get(args.conversationId),
      ctx.db.get(args.responseMessageId),
    ])
    if (
      !conversation ||
      conversation.ownerId !== user._id ||
      !responseMessage ||
      responseMessage.conversationId !== conversation._id ||
      responseMessage.role !== "assistant" ||
      (responseMessage.status !== "complete" &&
        responseMessage.status !== "stopped" &&
        responseMessage.status !== "failed") ||
      !responseMessage.content.trim()
    ) {
      throw new Error("Response unavailable")
    }

    const existing = await ctx.db
      .query("assistantResponseFeedback")
      .withIndex("by_response_message_id", (q) =>
        q.eq("responseMessageId", responseMessage._id)
      )
      .unique()

    const now = Date.now()
    if (args.rating === null) {
      if (existing) await ctx.db.delete(existing._id)
      return null
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating: args.rating,
        updatedAt: now,
      })
    } else {
      await ctx.db.insert("assistantResponseFeedback", {
        ownerId: user._id,
        conversationId: conversation._id,
        responseMessageId: responseMessage._id,
        rating: args.rating,
        createdAt: now,
        updatedAt: now,
      })
    }

    await upsertFeedbackMemory(ctx, {
      owner: user,
      conversation,
      responseMessage,
      rating: args.rating,
    })
    return null
  },
})
