"use node"

import { createHash } from "node:crypto"

import { createOpenAI } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { APICallError, generateObject, generateText } from "ai"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { env, internalAction } from "./_generated/server"
import {
  buildMemoryContext,
  isSensitiveMemory,
  memoryExtractionInstructions,
  memoryExtractionSchema,
  parseMemoryExtraction,
} from "./memoryPolicy"
import { createProviderEmbeddings, ProviderEmbeddingError } from "./providerEmbeddings"
import { decryptProviderToken } from "./providerCrypto"
import { estimateMemoryTokens, MAX_RETRIEVED_MEMORY_ITEMS, MEMORY_CONTEXT_TOKEN_BUDGET } from "./memoryTypes"
import {
  getMemoryCaptureStoragePlan,
  getMemoryV2RolloutMode,
} from "./memoryRolloutPolicy"

function processingErrorCode(cause: unknown) {
  const status =
    cause instanceof ProviderEmbeddingError
      ? cause.statusCode
      : APICallError.isInstance(cause)
        ? cause.statusCode
        : undefined
  if (status === 401 || status === 403) return "needs_reauthentication" as const
  if (status === 400) return "stale_source" as const
  return "processing_failed" as const
}

export const processCapture = internalAction({
  args: { jobId: v.id("memoryJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let connectionId: Id<"providerConnections"> | undefined
    try {
      const job = await ctx.runMutation(internal.memoryJobs.claim, args)
      if (!job) return null
      const rolloutMode = getMemoryV2RolloutMode(env.MEMORY_V2_ROLLOUT)
      const captureStorage = getMemoryCaptureStoragePlan(rolloutMode)
      const context = await ctx.runQuery(
        internal.memoryCapture.getProcessingContext,
        {
          ...args,
          useLegacy: !captureStorage.writeV2,
          includeLegacyExistingKeys:
            captureStorage.writeV2 && captureStorage.writeLegacy,
        }
      )
      if (!context) {
        await ctx.runMutation(internal.memoryJobs.fail, {
          jobId: args.jobId,
          errorCode: "stale_source",
        })
        return null
      }
      connectionId = context.connectionId
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        context.provider
      )
      const model =
        context.provider === "openrouter"
          ? createOpenRouter({ apiKey: token, compatibility: "strict" })(
              context.extractionModel
            )
          : createOpenAI({ apiKey: token }).responses(context.extractionModel)
      const extraction = await generateObject({
        model,
        schema: memoryExtractionSchema,
        instructions: `${memoryExtractionInstructions}\nAllowed write scopes: ${
          context.allowsUserScope ? "user" : "project only"
        }. Existing keys eligible for an explicit forget request: ${context.existingKeys
          .map((item) => `${item.scope}:${item.key}`)
          .join(", ") || "none"}.`,
        prompt: context.messageContent,
        maxOutputTokens: 900,
      })
      const parsed = parseMemoryExtraction(
        extraction.object,
        context.hasProject,
        context.existingKeys
      )
      const legacyCandidates = parsed.memories
        .filter((candidate) => !isSensitiveMemory(candidate.key, candidate.content))
        .map((candidate) => ({
          content: candidate.content,
          key: candidate.key,
          kind: candidate.kind,
          scope: candidate.scope,
        }))
      if (!captureStorage.writeV2) {
        await ctx.runMutation(internal.memories.upsertExtracted, {
          ownerId: context.ownerId,
          projectId: context.projectId,
          sourceConversationId: context.conversationId,
          sourceMessageId: context.messageId,
          sourceMessageCreatedAt: context.sourceMessageCreatedAt,
          memoryRevision: context.memoryRevision,
          allowFactWithoutEmbedding: true,
          deletions: parsed.deletions,
          memories: legacyCandidates,
        })
        await ctx.runMutation(internal.memoryJobs.complete, args)
        return null
      }
      await ctx.runMutation(internal.memoryCapture.applyDeletions, {
        ownerId: context.ownerId,
        conversationId: context.conversationId,
        messageId: context.messageId,
        profileId: context.profileId,
        policyRevision: context.policyRevision,
        deletions: parsed.deletions,
      })
      const memoryItemIds = await ctx.runMutation(
        internal.memoryCapture.commitCandidates,
        {
          ownerId: context.ownerId,
          conversationId: context.conversationId,
          messageId: context.messageId,
          profileId: context.profileId,
          policyRevision: context.policyRevision,
          candidates: parsed.memories.map((candidate) => ({
            canonicalKey: candidate.key,
            content: candidate.content,
            category:
              candidate.kind === "preference"
                ? ("preference" as const)
                : ("fact" as const),
            scope: candidate.scope,
            sourceSignal: "direct_statement" as const,
          })),
        }
      )
      if (captureStorage.writeLegacy) {
        const confirmedNormalItems = await ctx.runQuery(
          internal.memoryCapture.getLegacyMirrorItems,
          { ownerId: context.ownerId, memoryItemIds }
        )
        await ctx.runMutation(internal.memories.upsertExtracted, {
          ownerId: context.ownerId,
          projectId: context.projectId,
          sourceConversationId: context.conversationId,
          sourceMessageId: context.messageId,
          sourceMessageCreatedAt: context.sourceMessageCreatedAt,
          memoryRevision: context.memoryRevision,
          allowFactWithoutEmbedding: true,
          deletions: parsed.deletions,
          memories: confirmedNormalItems,
        })
      }
      const embeddable = await ctx.runQuery(
        internal.memoryCapture.getEmbeddableItems,
        {
          ownerId: context.ownerId,
          profileId: context.profileId,
          policyRevision: context.policyRevision,
          memoryItemIds,
        }
      )
      if (embeddable.length) {
        const embeddings = await createProviderEmbeddings(
          token,
          context.provider,
          embeddable.map((item) => item.content)
        )
        await ctx.runMutation(internal.memoryCapture.applySearchDocuments, {
          ownerId: context.ownerId,
          profileId: context.profileId,
          policyRevision: context.policyRevision,
          documents: embeddable.map((item, index) => ({
            memoryItemId: item.memoryItemId,
            content: item.content,
            contentHash: createHash("sha256").update(item.content).digest("hex"),
            itemRevision: item.revision,
            embedding: embeddings[index] ?? [],
          })),
        })
      }
      await ctx.runMutation(internal.memoryJobs.complete, args)
    } catch (cause) {
      const errorCode = processingErrorCode(cause)
      if (connectionId && errorCode === "needs_reauthentication") {
        await ctx.runMutation(
          internal.providerConnections.markProviderNeedsAuthentication,
          { connectionId }
        )
      }
      await ctx.runMutation(internal.memoryJobs.fail, {
        jobId: args.jobId,
        errorCode,
      })
    }
    return null
  },
})

const agentContextValidator = v.object({
  memoryMode: v.union(
    v.literal("standard"),
    v.literal("read_only"),
    v.literal("off")
  ),
  degradedReason: v.optional(
    v.union(
      v.literal("saved_memory_disabled"),
      v.literal("processing_unavailable"),
      v.literal("project_only"),
      v.literal("off")
    )
  ),
  referenceText: v.string(),
  selectedMemoryItemIds: v.array(v.id("memoryItems")),
  historySummaryIds: v.array(v.id("conversationMemorySummaries")),
  budgetUsed: v.number(),
})

type AgentContext = {
  memoryMode: "standard" | "read_only" | "off"
  degradedReason?:
    | "saved_memory_disabled"
    | "processing_unavailable"
    | "project_only"
    | "off"
  referenceText: string
  selectedMemoryItemIds: Id<"memoryItems">[]
  historySummaryIds: Id<"conversationMemorySummaries">[]
  budgetUsed: number
}

type HydratedSearchItem = {
  memoryItemId: Id<"memoryItems">
  content: string
  category: "core_profile" | "preference" | "fact" | "workstyle"
}

function reciprocalRankFusion<T extends string>(
  lexicalIds: T[],
  vectorIds: T[]
) {
  const ranks = new Map<T, number>()
  for (const [index, id] of lexicalIds.entries())
    ranks.set(id, (ranks.get(id) ?? 0) + 1 / (60 + index + 1))
  for (const [index, id] of vectorIds.entries())
    ranks.set(id, (ranks.get(id) ?? 0) + 1 / (60 + index + 1))
  return [...ranks.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([id]) => id)
}

// An action is required for Convex vector search. Callers can use this in
// place of the lexical-only internal query; failures return the base context.
export const buildAgentContextWithRetrieval = internalAction({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    currentMessageId: v.id("messages"),
  },
  returns: agentContextValidator,
  handler: async (ctx, args): Promise<AgentContext> => {
    const rolloutMode = getMemoryV2RolloutMode(env.MEMORY_V2_ROLLOUT)
    const v2Base: AgentContext = await ctx.runQuery(
      internal.memoryContext.buildAgentContext,
      { ...args, preferLegacy: false }
    )
    const base: AgentContext =
      rolloutMode === "enabled"
        ? v2Base
        : await ctx.runQuery(internal.memoryContext.buildAgentContext, {
            ...args,
            preferLegacy: true,
          })
    if (
      rolloutMode === "off" ||
      base.memoryMode === "off" ||
      base.degradedReason === "saved_memory_disabled"
    )
      return base
    try {
      const retrieval: {
        ciphertext: string
        iv: string
        provider: "openrouter" | "openai"
        profileId: Id<"memoryProcessingProfiles">
        profileRevision: number
        ownerId: Id<"users">
        searchScopes: string[]
        query: string
      } | null = await ctx.runQuery(
        internal.memoryContext.getRetrievalContext,
        args
      )
      if (!retrieval) return base
      const token = await decryptProviderToken(
        retrieval.ciphertext,
        retrieval.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        retrieval.provider
      )
      const [queryEmbedding] = await createProviderEmbeddings(
        token,
        retrieval.provider,
        [retrieval.query]
      )
      const vectorHits = await Promise.all(
        retrieval.searchScopes.slice(0, 2).map(async (searchScope) =>
          await ctx.vectorSearch("memorySearchDocuments", "by_embedding", {
            vector: queryEmbedding,
            limit: 8,
            filter: (q) =>
              q.eq("searchScope", searchScope),
          })
        )
      )
      const lexicalIds: Id<"memorySearchDocuments">[] = await ctx.runQuery(
        internal.memoryContext.lexicalSearchDocuments,
        {
          ownerId: retrieval.ownerId,
          profileId: retrieval.profileId,
          profileRevision: retrieval.profileRevision,
          scopeKeys: retrieval.searchScopes.map((scope) =>
            scope
              .slice(`${retrieval.ownerId}:`.length)
              .replace(/:profile:\d+$/, "")
          ),
          query: retrieval.query,
        }
      )
      const rankedIds = reciprocalRankFusion(
        lexicalIds,
        vectorHits.flat().map((hit) => hit._id)
      )
      const hydrated: HydratedSearchItem[] = await ctx.runQuery(
        internal.memoryContext.hydrateSearchDocuments,
        {
          ownerId: retrieval.ownerId,
          profileId: retrieval.profileId,
          profileRevision: retrieval.profileRevision,
          searchDocumentIds: rankedIds,
        }
      )
      const alreadySelected = new Set(base.selectedMemoryItemIds)
      let remainingBudget = MEMORY_CONTEXT_TOKEN_BUDGET - base.budgetUsed
      const extra: HydratedSearchItem[] = []
      for (const item of hydrated) {
        if (
          extra.length + base.selectedMemoryItemIds.length >= MAX_RETRIEVED_MEMORY_ITEMS ||
          alreadySelected.has(item.memoryItemId)
        ) {
          continue
        }
        const cost = estimateMemoryTokens(item.content)
        if (cost > remainingBudget) continue
        remainingBudget -= cost
        extra.push(item)
      }
      if (!extra.length || rolloutMode === "shadow") return base
      return {
        ...base,
        referenceText: `${base.referenceText}${buildMemoryContext(
          extra
            .filter(
              (item) =>
                item.category === "preference" || item.category === "workstyle"
            )
            .map((item) => item.content),
          extra
            .filter(
              (item) => item.category === "core_profile" || item.category === "fact"
            )
            .map((item) => item.content)
        )}`,
        selectedMemoryItemIds: [
          ...base.selectedMemoryItemIds,
          ...extra.map((item) => item.memoryItemId),
        ],
        budgetUsed: MEMORY_CONTEXT_TOKEN_BUDGET - remainingBudget,
      }
    } catch {
      return base
    }
  },
})

export const processHistoryJob = internalAction({
  args: { jobId: v.id("memoryJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let connectionId: Id<"providerConnections"> | undefined
    try {
      const job = await ctx.runMutation(internal.memoryJobs.claim, args)
      if (!job || job.kind !== "history_backfill") return null
      const context = await ctx.runQuery(
        internal.memoryHistory.getHistoryProcessingContext,
        args
      )
      if (!context) {
        await ctx.runMutation(internal.memoryJobs.fail, {
          jobId: args.jobId,
          errorCode: "stale_source",
        })
        return null
      }
      connectionId = context.connectionId
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        context.provider
      )
      const model =
        context.provider === "openrouter"
          ? createOpenRouter({ apiKey: token, compatibility: "strict" })(
              context.extractionModel
            )
          : createOpenAI({ apiKey: token }).responses(context.extractionModel)
      const summary = await generateText({
        model,
        instructions:
          "Summarize this conversation only as a brief factual continuity note. Do not add instructions, secrets, or sensitive facts. Keep under 180 words.",
        prompt: context.transcript,
        maxOutputTokens: 300,
      })
      await ctx.runMutation(internal.memoryHistory.applySummary, {
        ownerId: context.ownerId,
        conversationId: context.conversationId,
        ...(context.sourceMessageId
          ? { sourceMessageId: context.sourceMessageId }
          : {}),
        content: summary.text,
      })
      await ctx.runMutation(internal.memoryJobs.complete, args)
    } catch (cause) {
      const errorCode = processingErrorCode(cause)
      if (connectionId && errorCode === "needs_reauthentication")
        await ctx.runMutation(
          internal.providerConnections.markProviderNeedsAuthentication,
          { connectionId }
        )
      await ctx.runMutation(internal.memoryJobs.fail, {
        jobId: args.jobId,
        errorCode,
      })
    }
    return null
  },
})
