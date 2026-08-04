import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"

import type { Id } from "./_generated/dataModel"
import { query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { getCurrentUser } from "./authHelpers"

const categoryValidator = v.union(
  v.literal("upload"),
  v.literal("generated_image")
)

const storedAssetFields = {
  _id: v.id("libraryAssets"),
  _creationTime: v.number(),
  ownerId: v.id("users"),
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  createdAt: v.number(),
  url: v.union(v.string(), v.null()),
}

const libraryAssetValidator = v.union(
  v.object({
    ...storedAssetFields,
    category: v.literal("upload"),
    kind: v.literal("chat_upload"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
  }),
  v.object({
    ...storedAssetFields,
    category: v.literal("upload"),
    kind: v.literal("project_upload"),
    projectId: v.id("projects"),
    projectSourceId: v.id("projectSources"),
  }),
  v.object({
    ...storedAssetFields,
    category: v.literal("generated_image"),
    kind: v.literal("generated_image"),
    conversationId: v.id("conversations"),
    messageId: v.id("messages"),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
  })
)

type StoredAttachment = {
  storageId: Id<"_storage">
  name: string
  contentType: string
  size: number
}

export async function indexMessageAttachments(
  ctx: Pick<MutationCtx, "db">,
  args: {
    ownerId: Id<"users">
    conversationId: Id<"conversations">
    messageId: Id<"messages">
    role: "user" | "assistant"
    attachments: StoredAttachment[]
    createdAt: number
    outputMode?: "image" | "text"
    provider?: string
    model?: string
  }
) {
  if (args.role === "assistant" && args.outputMode !== "image") return

  for (const attachment of args.attachments) {
    if (
      args.role === "assistant" &&
      !attachment.contentType.startsWith("image/")
    )
      continue

    const existing = await ctx.db
      .query("libraryAssets")
      .withIndex("by_message_id_and_storage_id", (q) =>
        q.eq("messageId", args.messageId).eq("storageId", attachment.storageId)
      )
      .unique()
    if (existing) continue

    const origin = {
      ownerId: args.ownerId,
      conversationId: args.conversationId,
      messageId: args.messageId,
      ...attachment,
      createdAt: args.createdAt,
    }
    if (args.role === "user") {
      await ctx.db.insert("libraryAssets", {
        ...origin,
        category: "upload",
        kind: "chat_upload",
      })
    } else {
      await ctx.db.insert("libraryAssets", {
        ...origin,
        category: "generated_image",
        kind: "generated_image",
        ...(args.provider ? { provider: args.provider } : {}),
        ...(args.model ? { model: args.model } : {}),
      })
    }
  }
}

export async function indexProjectSource(
  ctx: Pick<MutationCtx, "db">,
  args: {
    ownerId: Id<"users">
    projectId: Id<"projects">
    projectSourceId: Id<"projectSources">
    attachment: StoredAttachment
    createdAt: number
  }
) {
  const existing = await ctx.db
    .query("libraryAssets")
    .withIndex("by_project_source_id", (q) =>
      q.eq("projectSourceId", args.projectSourceId)
    )
    .unique()
  if (existing) return

  await ctx.db.insert("libraryAssets", {
    ownerId: args.ownerId,
    category: "upload",
    kind: "project_upload",
    projectId: args.projectId,
    projectSourceId: args.projectSourceId,
    ...args.attachment,
    createdAt: args.createdAt,
  })
}

export async function removeMessageAssets(
  ctx: Pick<MutationCtx, "db">,
  messageId: Id<"messages">
) {
  for await (const asset of ctx.db
    .query("libraryAssets")
    .withIndex("by_message_id_and_storage_id", (q) =>
      q.eq("messageId", messageId)
    ))
    await ctx.db.delete(asset._id)
}

export async function removeProjectSourceAsset(
  ctx: Pick<MutationCtx, "db">,
  projectSourceId: Id<"projectSources">
) {
  const asset = await ctx.db
    .query("libraryAssets")
    .withIndex("by_project_source_id", (q) =>
      q.eq("projectSourceId", projectSourceId)
    )
    .unique()
  if (asset) await ctx.db.delete(asset._id)
}

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    category: v.optional(categoryValidator),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(libraryAssetValidator),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const search = args.search?.trim()
    const category = args.category
    if (search && search.length > 200) throw new Error("Search is too long")

    const result = search
      ? await (category
          ? ctx.db
              .query("libraryAssets")
              .withSearchIndex("search_name", (q) =>
                q
                  .search("name", search)
                  .eq("ownerId", user._id)
                  .eq("category", category)
              )
              .paginate(args.paginationOpts)
          : ctx.db
              .query("libraryAssets")
              .withSearchIndex("search_name", (q) =>
                q.search("name", search).eq("ownerId", user._id)
              )
              .paginate(args.paginationOpts))
      : await (category
          ? ctx.db
              .query("libraryAssets")
              .withIndex("by_owner_id_and_category_and_created_at", (q) =>
                q.eq("ownerId", user._id).eq("category", category)
              )
              .order("desc")
              .paginate(args.paginationOpts)
          : ctx.db
              .query("libraryAssets")
              .withIndex("by_owner_id_and_created_at", (q) =>
                q.eq("ownerId", user._id)
              )
              .order("desc")
              .paginate(args.paginationOpts))

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (asset) => ({
          ...asset,
          url: await ctx.storage.getUrl(asset.storageId),
        }))
      ),
    }
  },
})
