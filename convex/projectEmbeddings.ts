import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import {
  getProjectEmbeddingSearchScope,
  getProjectEmbeddingModel,
  isIndexableProjectSource,
  matchesProjectEmbeddingPolicy,
  MAX_PROJECT_SOURCE_CHUNKS,
  PROJECT_EMBEDDING_DIMENSIONS,
} from "./projectEmbeddingPolicy"

export const embeddingProviderValidator = v.union(
  v.literal("openrouter"),
  v.literal("openai")
)
export const indexStatusValidator = v.union(
  v.literal("queued"),
  v.literal("extracting"),
  v.literal("indexing"),
  v.literal("ready"),
  v.literal("partial"),
  v.literal("failed"),
  v.literal("unsupported")
)
export const indexErrorCodeValidator = v.union(
  v.literal("provider_required"),
  v.literal("needs_reauthentication"),
  v.literal("insufficient_credits"),
  v.literal("unsupported"),
  v.literal("indexing_failed")
)

const MAX_PROJECT_SOURCES = 8
const CLEANUP_BATCH_SIZE = 50

export async function getOwnedEmbeddingConnection(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  connectionId: Id<"providerConnections">
): Promise<{
  _id: Id<"providerConnections">
  provider: "openrouter" | "openai"
}> {
  const connection = await ctx.db.get(connectionId)
  if (
    !connection ||
    connection.ownerId !== ownerId ||
    (connection.provider !== "openrouter" &&
      connection.provider !== "openai") ||
    connection.status !== "connected"
  )
    throw new Error("Embedding provider unavailable")
  const credential = await ctx.db
    .query("providerCredentials")
    .withIndex("by_connection_id", (query) =>
      query.eq("connectionId", connection._id)
    )
    .unique()
  if (!credential) throw new Error("Embedding provider unavailable")
  return { _id: connection._id, provider: connection.provider }
}

export async function insertSourceIndexState(
  ctx: MutationCtx,
  args: {
    ownerId: Id<"users">
    projectId: Id<"projects">
    sourceId: Id<"projectSources">
    contentType?: string
    sourceName?: string
    profileId?: Id<"projectEmbeddingProfiles">
    profileRevision?: number
  }
) {
  const supported =
    args.contentType !== undefined &&
    isIndexableProjectSource(args.contentType, args.sourceName)
  const configured = Boolean(args.profileId && args.profileRevision)
  const stateId = await ctx.db.insert("projectSourceIndexStates", {
    ownerId: args.ownerId,
    projectId: args.projectId,
    sourceId: args.sourceId,
    ...(args.profileId ? { embeddingProfileId: args.profileId } : {}),
    ...(args.profileRevision
      ? { embeddingProfileRevision: args.profileRevision }
      : {}),
    status: !supported ? "unsupported" : configured ? "queued" : "failed",
    ...(!supported
      ? { errorCode: "unsupported" as const }
      : !configured
        ? { errorCode: "provider_required" as const }
        : {}),
    chunkCount: 0,
    attempts: 0,
    updatedAt: Date.now(),
  })
  if (supported && configured)
    await ctx.scheduler.runAfter(
      0,
      internal.openRouterResponses.indexProjectSource,
      { stateId }
    )
  return stateId
}

export async function configureEmbeddingProfile(
  ctx: MutationCtx,
  ownerId: Id<"users">,
  projectId: Id<"projects">,
  providerConnectionId: Id<"providerConnections">
) {
  const project = await ctx.db.get(projectId)
  if (!project || project.ownerId !== ownerId)
    throw new Error("Project unavailable")
  const connection = await getOwnedEmbeddingConnection(
    ctx,
    ownerId,
    providerConnectionId
  )
  const currentProfile = project.embeddingProfileId
    ? await ctx.db.get(project.embeddingProfileId)
    : null
  if (
    currentProfile?.ownerId === ownerId &&
    currentProfile.projectId === projectId &&
    currentProfile.providerConnectionId === connection._id &&
    currentProfile.revision === project.embeddingProfileRevision &&
    currentProfile.status === "active" &&
    matchesProjectEmbeddingPolicy(currentProfile, connection.provider)
  )
    return currentProfile._id

  const revision = (project.embeddingProfileRevision ?? 0) + 1
  const now = Date.now()
  if (currentProfile)
    await ctx.db.patch(currentProfile._id, {
      status: "superseded",
      updatedAt: now,
    })
  const profileId = await ctx.db.insert("projectEmbeddingProfiles", {
    ownerId,
    projectId,
    providerConnectionId: connection._id,
    provider: connection.provider,
    model: getProjectEmbeddingModel(connection.provider),
    dimensions: PROJECT_EMBEDDING_DIMENSIONS,
    revision,
    status: "active",
    updatedAt: now,
  })
  await ctx.db.patch(project._id, {
    embeddingProfileId: profileId,
    embeddingProfileRevision: revision,
    updatedAt: now,
  })
  const sources = await ctx.db
    .query("projectSources")
    .withIndex("by_project_id_and_created_at", (query) =>
      query.eq("projectId", projectId)
    )
    .take(MAX_PROJECT_SOURCES)
  for (const source of sources)
    await insertSourceIndexState(ctx, {
      ownerId,
      projectId,
      sourceId: source._id,
      ...(source.kind === "file"
        ? { contentType: source.contentType, sourceName: source.name }
        : {}),
      profileId,
      profileRevision: revision,
    })
  if (currentProfile)
    await ctx.scheduler.runAfter(
      0,
      internal.projectEmbeddings.cleanupEmbeddingProfileData,
      { profileId: currentProfile._id }
    )
  return profileId
}

export const getProjectSourceIndexingContext = internalQuery({
  args: { stateId: v.id("projectSourceIndexStates") },
  returns: v.union(
    v.object({
      kind: v.literal("ready"),
      ciphertext: v.string(),
      iv: v.string(),
      connectionId: v.id("providerConnections"),
      ownerId: v.id("users"),
      projectId: v.id("projects"),
      sourceId: v.id("projectSources"),
      storageId: v.id("_storage"),
      contentType: v.string(),
      provider: embeddingProviderValidator,
      profileId: v.id("projectEmbeddingProfiles"),
      profileRevision: v.number(),
    }),
    v.object({
      kind: v.literal("error"),
      errorCode: indexErrorCodeValidator,
      connectionId: v.optional(v.id("providerConnections")),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId)
    if (!state || !state.embeddingProfileId || !state.embeddingProfileRevision)
      return null
    const [project, source, profile] = await Promise.all([
      ctx.db.get(state.projectId),
      ctx.db.get(state.sourceId),
      ctx.db.get(state.embeddingProfileId),
    ])
    if (
      !project ||
      !source ||
      !profile ||
      project.ownerId !== state.ownerId ||
      source.ownerId !== state.ownerId ||
      source.projectId !== project._id ||
      profile.ownerId !== state.ownerId ||
      profile.projectId !== project._id ||
      project.embeddingProfileId !== profile._id ||
      project.embeddingProfileRevision !== profile.revision ||
      profile.revision !== state.embeddingProfileRevision ||
      profile.status !== "active"
    )
      return null
    if (
      profile.dimensions !== PROJECT_EMBEDDING_DIMENSIONS ||
      profile.model !== getProjectEmbeddingModel(profile.provider)
    )
      return {
        kind: "error" as const,
        errorCode: "indexing_failed" as const,
      }
    if (
      source.kind !== "file" ||
      !isIndexableProjectSource(source.contentType, source.name)
    )
      return { kind: "error" as const, errorCode: "unsupported" as const }
    const connection = await ctx.db.get(profile.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== state.ownerId ||
      connection.provider !== profile.provider
    )
      return { kind: "error" as const, errorCode: "provider_required" as const }
    if (connection.status !== "connected")
      return {
        kind: "error" as const,
        errorCode: "needs_reauthentication" as const,
        connectionId: connection._id,
      }
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (query) =>
        query.eq("connectionId", connection._id)
      )
      .unique()
    if (!credential)
      return {
        kind: "error" as const,
        errorCode: "needs_reauthentication" as const,
        connectionId: connection._id,
      }
    return {
      kind: "ready" as const,
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      connectionId: connection._id,
      ownerId: state.ownerId,
      projectId: project._id,
      sourceId: source._id,
      storageId: source.storageId,
      contentType: source.contentType,
      provider: connection.provider,
      profileId: profile._id,
      profileRevision: profile.revision,
    }
  },
})

export const setProjectSourceIndexStatus = internalMutation({
  args: {
    stateId: v.id("projectSourceIndexStates"),
    status: v.union(v.literal("extracting"), v.literal("indexing")),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId)
    if (!state?.embeddingProfileId) return false
    const project = await ctx.db.get(state.projectId)
    if (project?.embeddingProfileId !== state.embeddingProfileId) return false
    await ctx.db.patch(state._id, {
      status: args.status,
      errorCode: undefined,
      attempts:
        args.status === "extracting" ? state.attempts + 1 : state.attempts,
      updatedAt: Date.now(),
    })
    return true
  },
})

export const failProjectSourceIndex = internalMutation({
  args: {
    stateId: v.id("projectSourceIndexStates"),
    errorCode: indexErrorCodeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const state = await ctx.db.get(args.stateId)
    if (!state) return null
    const project = await ctx.db.get(state.projectId)
    if (
      state.embeddingProfileId &&
      project?.embeddingProfileId !== state.embeddingProfileId
    )
      return null
    await ctx.db.patch(state._id, {
      status: args.errorCode === "unsupported" ? "unsupported" : "failed",
      errorCode: args.errorCode,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const applyProjectSourceChunks = internalMutation({
  args: {
    stateId: v.id("projectSourceIndexStates"),
    sourceFingerprint: v.string(),
    partial: v.boolean(),
    chunks: v.array(
      v.object({
        chunkIndex: v.number(),
        content: v.string(),
        embedding: v.array(v.float64()),
      })
    ),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    if (
      args.chunks.length > MAX_PROJECT_SOURCE_CHUNKS ||
      args.chunks.some(
        (chunk) =>
          chunk.embedding.length !== PROJECT_EMBEDDING_DIMENSIONS ||
          chunk.embedding.some((value) => !Number.isFinite(value))
      )
    )
      throw new Error("Invalid project source embeddings")
    const state = await ctx.db.get(args.stateId)
    if (!state?.embeddingProfileId || !state.embeddingProfileRevision)
      return false
    const [project, source, profile] = await Promise.all([
      ctx.db.get(state.projectId),
      ctx.db.get(state.sourceId),
      ctx.db.get(state.embeddingProfileId),
    ])
    if (
      !project ||
      !source ||
      !profile ||
      project.embeddingProfileId !== profile._id ||
      project.embeddingProfileRevision !== profile.revision ||
      state.embeddingProfileRevision !== profile.revision ||
      source.projectId !== project._id ||
      source.ownerId !== state.ownerId
    )
      return false
    const existing = await ctx.db
      .query("projectSourceChunks")
      .withIndex("by_source_id_and_embedding_profile_revision", (query) =>
        query
          .eq("sourceId", source._id)
          .eq("embeddingProfileRevision", profile.revision)
      )
      .take(MAX_PROJECT_SOURCE_CHUNKS + 1)
    if (existing.length > MAX_PROJECT_SOURCE_CHUNKS)
      throw new Error("Project source has too many chunks")
    for (const chunk of existing) await ctx.db.delete(chunk._id)
    const searchScope = getProjectEmbeddingSearchScope(
      state.ownerId,
      project._id,
      profile.revision
    )
    for (const chunk of args.chunks)
      await ctx.db.insert("projectSourceChunks", {
        ownerId: state.ownerId,
        projectId: project._id,
        sourceId: source._id,
        embeddingProfileId: profile._id,
        embeddingProfileRevision: profile.revision,
        sourceFingerprint: args.sourceFingerprint,
        searchScope,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        embedding: chunk.embedding,
      })
    await ctx.db.patch(state._id, {
      sourceFingerprint: args.sourceFingerprint,
      status: args.partial ? "partial" : "ready",
      errorCode: undefined,
      chunkCount: args.chunks.length,
      updatedAt: Date.now(),
    })
    return true
  },
})

export const getProjectRetrievalContext = internalQuery({
  args: { ownerId: v.id("users"), projectId: v.id("projects") },
  returns: v.union(
    v.object({
      ciphertext: v.string(),
      iv: v.string(),
      connectionId: v.id("providerConnections"),
      provider: embeddingProviderValidator,
      profileId: v.id("projectEmbeddingProfiles"),
      profileRevision: v.number(),
      searchScope: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (
      !project ||
      project.ownerId !== args.ownerId ||
      !project.embeddingProfileId
    )
      return null
    const profile = await ctx.db.get(project.embeddingProfileId)
    if (
      !profile ||
      profile.ownerId !== args.ownerId ||
      profile.projectId !== project._id ||
      profile.status !== "active" ||
      profile.revision !== project.embeddingProfileRevision ||
      profile.dimensions !== PROJECT_EMBEDDING_DIMENSIONS ||
      profile.model !== getProjectEmbeddingModel(profile.provider)
    )
      return null
    const indexStates = await ctx.db
      .query("projectSourceIndexStates")
      .withIndex("by_embedding_profile_id_and_updated_at", (query) =>
        query.eq("embeddingProfileId", profile._id)
      )
      .order("desc")
      .take(MAX_PROJECT_SOURCES)
    let hasSearchableSource = false
    for (const state of indexStates) {
      if (
        state.ownerId !== args.ownerId ||
        state.projectId !== project._id ||
        state.embeddingProfileRevision !== profile.revision ||
        (state.status !== "ready" && state.status !== "partial") ||
        state.chunkCount <= 0 ||
        state.sourceFingerprint === undefined
      )
        continue
      const source = await ctx.db.get(state.sourceId)
      if (
        source?.ownerId === args.ownerId &&
        source.projectId === project._id &&
        source.kind === "file" &&
        isIndexableProjectSource(source.contentType, source.name)
      ) {
        hasSearchableSource = true
        break
      }
    }
    if (!hasSearchableSource) return null
    const connection = await ctx.db.get(profile.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== args.ownerId ||
      connection.status !== "connected" ||
      connection.provider !== profile.provider
    )
      return null
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (query) =>
        query.eq("connectionId", connection._id)
      )
      .unique()
    if (!credential) return null
    return {
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      connectionId: connection._id,
      provider: connection.provider,
      profileId: profile._id,
      profileRevision: profile.revision,
      searchScope: getProjectEmbeddingSearchScope(
        args.ownerId,
        project._id,
        profile.revision
      ),
    }
  },
})

export const hydrateProjectSearchResults = internalQuery({
  args: {
    ownerId: v.id("users"),
    projectId: v.id("projects"),
    profileId: v.id("projectEmbeddingProfiles"),
    profileRevision: v.number(),
    chunkIds: v.array(v.id("projectSourceChunks")),
  },
  returns: v.array(
    v.object({
      chunkId: v.id("projectSourceChunks"),
      content: v.string(),
      name: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId)
    if (
      !project ||
      project.ownerId !== args.ownerId ||
      project.embeddingProfileId !== args.profileId ||
      project.embeddingProfileRevision !== args.profileRevision
    )
      return []
    const results = []
    for (const chunkId of args.chunkIds.slice(0, 12)) {
      const chunk = await ctx.db.get(chunkId)
      if (
        !chunk ||
        chunk.ownerId !== args.ownerId ||
        chunk.projectId !== project._id ||
        chunk.embeddingProfileId !== args.profileId ||
        chunk.embeddingProfileRevision !== args.profileRevision
      )
        continue
      const [source, states] = await Promise.all([
        ctx.db.get(chunk.sourceId),
        ctx.db
          .query("projectSourceIndexStates")
          .withIndex("by_source_id_and_updated_at", (query) =>
            query.eq("sourceId", chunk.sourceId)
          )
          .order("desc")
          .take(20),
      ])
      const state = states.find(
        (candidate) => candidate.embeddingProfileId === args.profileId
      )
      if (
        !source ||
        source.ownerId !== args.ownerId ||
        source.projectId !== project._id ||
        !state ||
        (state.status !== "ready" && state.status !== "partial") ||
        state.sourceFingerprint !== chunk.sourceFingerprint
      )
        continue
      results.push({
        chunkId: chunk._id,
        content: chunk.content,
        name: source.name,
      })
    }
    return results
  },
})

export const cleanupEmbeddingProfileData = internalMutation({
  args: { profileId: v.id("projectEmbeddingProfiles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId)
    if (profile?.status === "active") return null
    const chunks = await ctx.db
      .query("projectSourceChunks")
      .withIndex("by_embedding_profile_id", (query) =>
        query.eq("embeddingProfileId", args.profileId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const chunk of chunks) await ctx.db.delete(chunk._id)
    if (chunks.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupEmbeddingProfileData,
        args
      )
      return null
    }
    const states = await ctx.db
      .query("projectSourceIndexStates")
      .withIndex("by_embedding_profile_id_and_updated_at", (query) =>
        query.eq("embeddingProfileId", args.profileId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const state of states) await ctx.db.delete(state._id)
    if (states.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupEmbeddingProfileData,
        args
      )
      return null
    }
    if (profile) await ctx.db.delete(profile._id)
    return null
  },
})

export const cleanupSourceEmbeddingData = internalMutation({
  args: { sourceId: v.id("projectSources") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("projectSourceChunks")
      .withIndex("by_source_id_and_embedding_profile_revision", (query) =>
        query.eq("sourceId", args.sourceId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const chunk of chunks) await ctx.db.delete(chunk._id)
    if (chunks.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupSourceEmbeddingData,
        args
      )
      return null
    }
    const states = await ctx.db
      .query("projectSourceIndexStates")
      .withIndex("by_source_id_and_updated_at", (query) =>
        query.eq("sourceId", args.sourceId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const state of states) await ctx.db.delete(state._id)
    if (states.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupSourceEmbeddingData,
        args
      )
    return null
  },
})

export const cleanupProjectEmbeddingData = internalMutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("projectSourceChunks")
      .withIndex("by_project_id_and_embedding_profile_revision", (query) =>
        query.eq("projectId", args.projectId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const chunk of chunks) await ctx.db.delete(chunk._id)
    if (chunks.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupProjectEmbeddingData,
        args
      )
      return null
    }
    const states = await ctx.db
      .query("projectSourceIndexStates")
      .withIndex("by_project_id_and_updated_at", (query) =>
        query.eq("projectId", args.projectId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const state of states) await ctx.db.delete(state._id)
    if (states.length === CLEANUP_BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupProjectEmbeddingData,
        args
      )
      return null
    }
    const profiles = await ctx.db
      .query("projectEmbeddingProfiles")
      .withIndex("by_project_id_and_revision", (query) =>
        query.eq("projectId", args.projectId)
      )
      .take(CLEANUP_BATCH_SIZE)
    for (const profile of profiles) await ctx.db.delete(profile._id)
    if (profiles.length === CLEANUP_BATCH_SIZE)
      await ctx.scheduler.runAfter(
        0,
        internal.projectEmbeddings.cleanupProjectEmbeddingData,
        args
      )
    return null
  },
})
