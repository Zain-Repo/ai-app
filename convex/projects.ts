import { v } from "convex/values"

import { internal } from "./_generated/api"
import { mutation, query } from "./_generated/server"
import { consumeDraftAttachments } from "./attachments"
import { getCurrentUser } from "./authHelpers"

const MAX_PROJECTS = 50
const MAX_PROJECT_INSTRUCTIONS_LENGTH = 8_000
const MAX_PROJECT_SOURCES = 8
const MAX_SOURCE_URL_LENGTH = 2_048
const MAX_PROJECT_CONVERSATIONS = 100
const MAX_MEMORIES_PER_USER = 100

function normalizeSourceUrl(value: string) {
  const input = value.trim()
  if (!input || input.length > MAX_SOURCE_URL_LENGTH)
    throw new Error("Source link is invalid")

  let url: URL
  try {
    url = new URL(input)
  } catch {
    throw new Error("Source link is invalid")
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Source link is invalid")
  url.hash = ""
  return url.toString()
}

export const create = mutation({
  args: {
    instructions: v.optional(v.string()),
    memoryScope: v.optional(
      v.union(v.literal("project_only"), v.literal("all_chats"))
    ),
    name: v.string(),
    sourceDraftAttachmentIds: v.optional(v.array(v.id("draftAttachments"))),
    sourceLinks: v.optional(v.array(v.string())),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const name = args.name.trim()
    const instructions = args.instructions?.trim()

    if (!name) throw new Error("Project name is required")
    if (name.length > 80) throw new Error("Project name is too long")
    if (instructions && instructions.length > MAX_PROJECT_INSTRUCTIONS_LENGTH)
      throw new Error("Project instructions are too long")

    const sourceLinks = [
      ...new Set((args.sourceLinks ?? []).map(normalizeSourceUrl)),
    ]
    const sourceDraftAttachmentIds = args.sourceDraftAttachmentIds ?? []
    if (
      sourceLinks.length + sourceDraftAttachmentIds.length >
      MAX_PROJECT_SOURCES
    )
      throw new Error(`Add no more than ${MAX_PROJECT_SOURCES} sources`)
    const sourceFiles = await consumeDraftAttachments(
      ctx,
      user._id,
      sourceDraftAttachmentIds
    )

    const projectId = await ctx.db.insert("projects", {
      ownerId: user._id,
      name,
      ...(instructions ? { instructions } : {}),
      memoryScope: args.memoryScope ?? "all_chats",
      updatedAt: Date.now(),
    })
    const createdAt = Date.now()
    for (const [index, file] of sourceFiles.entries())
      await ctx.db.insert("projectSources", {
        ownerId: user._id,
        projectId,
        kind: "file",
        ...file,
        createdAt: createdAt + index,
      })
    for (const [index, url] of sourceLinks.entries())
      await ctx.db.insert("projectSources", {
        ownerId: user._id,
        projectId,
        kind: "link",
        name: new URL(url).hostname,
        url,
        createdAt: createdAt + sourceFiles.length + index,
      })
    return projectId
  },
})

export const addSources = mutation({
  args: {
    projectId: v.id("projects"),
    sourceDraftAttachmentIds: v.array(v.id("draftAttachments")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== user._id)
      throw new Error("Project unavailable")

    const existingSources = await ctx.db
      .query("projectSources")
      .withIndex("by_project_id_and_created_at", (indexQuery) =>
        indexQuery.eq("projectId", project._id)
      )
      .take(MAX_PROJECT_SOURCES)
    if (
      existingSources.length + args.sourceDraftAttachmentIds.length >
      MAX_PROJECT_SOURCES
    )
      throw new Error(`Add no more than ${MAX_PROJECT_SOURCES} sources`)

    const sourceFiles = await consumeDraftAttachments(
      ctx,
      user._id,
      args.sourceDraftAttachmentIds
    )
    const createdAt = Date.now()
    for (const [index, file] of sourceFiles.entries())
      await ctx.db.insert("projectSources", {
        ownerId: user._id,
        projectId: project._id,
        kind: "file",
        ...file,
        createdAt: createdAt + index,
      })
    await ctx.db.patch(project._id, { updatedAt: createdAt })
    return null
  },
})

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("projects"),
      _creationTime: v.number(),
      instructions: v.optional(v.string()),
      memoryScope: v.optional(
        v.union(v.literal("project_only"), v.literal("all_chats"))
      ),
      name: v.string(),
      ownerId: v.id("users"),
      updatedAt: v.number(),
    })
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    return await ctx.db
      .query("projects")
      .withIndex("by_owner_id_and_updated_at", (indexQuery) =>
        indexQuery.eq("ownerId", user._id)
      )
      .order("desc")
      .take(MAX_PROJECTS)
  },
})

export const listSources = query({
  args: { projectId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("projectSources"),
      _creationTime: v.number(),
      contentType: v.optional(v.string()),
      createdAt: v.number(),
      kind: v.union(v.literal("file"), v.literal("link")),
      name: v.string(),
      size: v.optional(v.number()),
      url: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const projectId = ctx.db.normalizeId("projects", args.projectId)
    if (!projectId) return []
    const project = await ctx.db.get(projectId)
    if (!project || project.ownerId !== user._id) return []

    const sources = await ctx.db
      .query("projectSources")
      .withIndex("by_project_id_and_created_at", (indexQuery) =>
        indexQuery.eq("projectId", project._id)
      )
      .order("asc")
      .take(MAX_PROJECT_SOURCES)

    return await Promise.all(
      sources.map(async (source) => ({
        _id: source._id,
        _creationTime: source._creationTime,
        ...(source.kind === "file"
          ? { contentType: source.contentType, size: source.size }
          : {}),
        createdAt: source.createdAt,
        kind: source.kind,
        name: source.name,
        url:
          source.kind === "link"
            ? source.url
            : await ctx.storage.getUrl(source.storageId),
      }))
    )
  },
})

export const rename = mutation({
  args: { name: v.string(), projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== user._id)
      throw new Error("Project unavailable")

    const name = args.name.trim()
    if (!name) throw new Error("Project name is required")
    if (name.length > 80) throw new Error("Project name is too long")
    await ctx.db.patch(project._id, { name, updatedAt: Date.now() })
    return null
  },
})

export const remove = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const project = await ctx.db.get(args.projectId)
    if (!project || project.ownerId !== user._id)
      throw new Error("Project unavailable")

    // ponytail: cap the atomic cleanup; schedule batches if projects exceed 100 chats.
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_project_id_and_updated_at", (indexQuery) =>
        indexQuery.eq("projectId", project._id)
      )
      .take(MAX_PROJECT_CONVERSATIONS + 1)
    if (conversations.length > MAX_PROJECT_CONVERSATIONS)
      throw new Error("Project has too many chats to delete")

    const sources = await ctx.db
      .query("projectSources")
      .withIndex("by_project_id_and_created_at", (indexQuery) =>
        indexQuery.eq("projectId", project._id)
      )
      .take(MAX_PROJECT_SOURCES)
    const memories = (
      await ctx.db
        .query("memories")
        .withIndex("by_owner_id_and_updated_at", (indexQuery) =>
          indexQuery.eq("ownerId", user._id)
        )
        .take(MAX_MEMORIES_PER_USER)
    ).filter((memory) => memory.projectId === project._id)

    for (const conversation of conversations)
      await ctx.db.patch(conversation._id, {
        projectId: undefined,
        updatedAt: Date.now(),
      })
    for (const source of sources) {
      if (source.kind === "file") await ctx.storage.delete(source.storageId)
      await ctx.db.delete(source._id)
    }
    for (const memory of memories) await ctx.db.delete(memory._id)
    if (memories.length)
      await ctx.db.patch(user._id, {
        memoryRevision: (user.memoryRevision ?? 0) + 1,
      })
    await ctx.db.delete(project._id)
    await ctx.scheduler.runAfter(
      0,
      internal.terminalSandboxActions.removeWorkspace,
      { key: project._id, scope: "project" }
    )
    return null
  },
})
