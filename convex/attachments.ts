import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, mutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  normalizeAttachmentName,
} from "./attachmentPolicy"
import { getCurrentUser } from "./authHelpers"

const DRAFT_LIFETIME_MS = 60 * 60 * 1000

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await getCurrentUser(ctx)
    return await ctx.storage.generateUploadUrl()
  },
})

export const register = mutation({
  args: { name: v.string(), storageId: v.id("_storage") },
  returns: v.id("draftAttachments"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const existing = await ctx.db
      .query("draftAttachments")
      .withIndex("by_storage_id", (query) =>
        query.eq("storageId", args.storageId)
      )
      .unique()
    if (existing) {
      if (existing.ownerId !== user._id) throw new Error("File unavailable")
      return existing._id
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId)
    if (!metadata) throw new Error("File unavailable")
    const draftAttachmentId = await ctx.db.insert("draftAttachments", {
      ownerId: user._id,
      storageId: args.storageId,
      name: normalizeAttachmentName(args.name),
      contentType:
        metadata.contentType?.slice(0, 255) || "application/octet-stream",
      size: metadata.size,
      createdAt: Date.now(),
    })
    await ctx.scheduler.runAfter(
      DRAFT_LIFETIME_MS,
      internal.attachments.cleanupDraft,
      { draftAttachmentId, storageId: args.storageId }
    )
    return draftAttachmentId
  },
})

export const discard = mutation({
  args: { draftAttachmentId: v.id("draftAttachments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const attachment = await ctx.db.get(args.draftAttachmentId)
    if (!attachment || attachment.ownerId !== user._id)
      throw new Error("File unavailable")
    await ctx.storage.delete(attachment.storageId)
    await ctx.db.delete(attachment._id)
    return null
  },
})

export const cleanupDraft = internalMutation({
  args: {
    draftAttachmentId: v.id("draftAttachments"),
    storageId: v.id("_storage"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const attachment = await ctx.db.get(args.draftAttachmentId)
    if (attachment?.storageId === args.storageId) {
      await ctx.storage.delete(args.storageId)
      await ctx.db.delete(attachment._id)
    }
    return null
  },
})

export async function consumeDraftAttachments(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  draftAttachmentIds: Id<"draftAttachments">[]
) {
  if (draftAttachmentIds.length > MAX_ATTACHMENTS)
    throw new Error(`Attach no more than ${MAX_ATTACHMENTS} files`)
  if (new Set(draftAttachmentIds).size !== draftAttachmentIds.length)
    throw new Error("Duplicate files are not allowed")

  const drafts = await Promise.all(
    draftAttachmentIds.map(
      async (attachmentId) => await ctx.db.get(attachmentId)
    )
  )
  if (drafts.some((attachment) => attachment?.ownerId !== ownerId))
    throw new Error("File unavailable")
  if (
    drafts.some(
      (attachment) =>
        !attachment ||
        attachment.size === 0 ||
        attachment.size > MAX_ATTACHMENT_BYTES
    )
  )
    throw new Error("File must be between 1 byte and 20 MB")

  for (const draft of drafts) if (draft) await ctx.db.delete(draft._id)
  return drafts.flatMap((draft) =>
    draft
      ? [
          {
            storageId: draft.storageId,
            name: draft.name,
            contentType: draft.contentType,
            size: draft.size,
          },
        ]
      : []
  )
}
