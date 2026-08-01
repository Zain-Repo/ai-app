import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import { buildMemoryContext } from "./memoryPolicy"
import {
  estimateMemoryTokens,
  getMemoryScopeKey,
  MAX_RETRIEVED_MEMORY_ITEMS,
  MEMORY_CONTEXT_TOKEN_BUDGET,
} from "./memoryTypes"

const contextResultValidator = v.object({
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

const retrievalContextValidator = v.union(
  v.object({
    ciphertext: v.string(),
    iv: v.string(),
    provider: v.union(v.literal("openrouter"), v.literal("openai")),
    profileId: v.id("memoryProcessingProfiles"),
    profileRevision: v.number(),
    ownerId: v.id("users"),
    searchScopes: v.array(v.string()),
    query: v.string(),
  }),
  v.null()
)

type ContextMemory = Pick<
  Doc<"memoryItems">,
  "_id" | "canonicalKey" | "category" | "content" | "pinned" | "scope" | "updatedAt"
>

function selectScopedMemory(
  items: ContextMemory[],
  budget: number,
  maxItems = MAX_RETRIEVED_MEMORY_ITEMS
) {
  const projectKeys = new Set(
    items
      .filter((item) => item.scope === "project")
      .map((item) => item.canonicalKey)
  )
  const sorted = [...items].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt
  )
  const seen = new Set<string>()
  const selected: ContextMemory[] = []
  let used = 0
  for (const item of sorted) {
    if (
      seen.has(item.canonicalKey) ||
      (item.scope === "user" && projectKeys.has(item.canonicalKey))
    ) {
      continue
    }
    const cost = estimateMemoryTokens(item.content)
    if (selected.length >= maxItems || used + cost > budget)
      continue
    seen.add(item.canonicalKey)
    selected.push(item)
    used += cost
  }
  return { selected, used }
}

export const buildAgentContext = internalQuery({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    currentMessageId: v.optional(v.id("messages")),
    preferLegacy: v.optional(v.boolean()),
  },
  returns: contextResultValidator,
  handler: async (ctx, args) => {
    const [owner, conversation, currentMessage] = await Promise.all([
      ctx.db.get(args.ownerId),
      ctx.db.get(args.conversationId),
      args.currentMessageId
        ? ctx.db.get(args.currentMessageId)
        : Promise.resolve(null),
    ])
    if (
      !owner ||
      !conversation ||
      conversation.ownerId !== owner._id ||
      (args.currentMessageId !== undefined &&
        (!currentMessage ||
          currentMessage.conversationId !== conversation._id ||
          currentMessage.role !== "user" ||
          currentMessage.status !== "complete"))
    ) {
      throw new Error("Memory context unavailable")
    }
    const memoryMode = conversation.memoryMode ?? "standard"
    if (memoryMode === "off") {
      return {
        memoryMode,
        degradedReason: "off" as const,
        referenceText: "",
        selectedMemoryItemIds: [],
        historySummaryIds: [],
        budgetUsed: 0,
      }
    }
    const savedMemoryEnabled = owner.memoryEnabled ?? false
    const project = conversation.projectId
      ? await ctx.db.get(conversation.projectId)
      : null
    if (conversation.projectId && (!project || project.ownerId !== owner._id))
      throw new Error("Memory project unavailable")
    const includeUser = project?.memoryScope !== "project_only"
    const scopeKeys = [
      ...(includeUser ? [getMemoryScopeKey("user")] : []),
      ...(project ? [getMemoryScopeKey("project", project._id)] : []),
    ]
    const scoped = savedMemoryEnabled
      ? await Promise.all(
          scopeKeys.map(async (scopeKey) =>
            await ctx.db
              .query("memoryItems")
              .withIndex("by_owner_id_and_scope_key_and_status_and_updated_at", (q) =>
                q.eq("ownerId", owner._id).eq("scopeKey", scopeKey).eq("status", "active")
              )
              .order("desc")
              .take(100)
          )
        )
      : []
    const eligible = (args.preferLegacy || !savedMemoryEnabled ? [] : scoped.flat())
      .filter(
        (item) =>
          item.confirmation === "confirmed"
      )
    const core = eligible.filter((item) => item.category === "core_profile")
    const nonCore = eligible.filter(
      (item) =>
        item.category !== "core_profile" &&
        (item.pinned ||
          item.sourceSignal === "manual" ||
          item.sensitivity === "sensitive")
    )
    const coreSelection = selectScopedMemory(
      core,
      Math.min(400, MEMORY_CONTEXT_TOKEN_BUDGET),
      3
    )
    const restSelection = selectScopedMemory(
      nonCore,
      MEMORY_CONTEXT_TOKEN_BUDGET - coreSelection.used,
      MAX_RETRIEVED_MEMORY_ITEMS - coreSelection.selected.length
    )
    const selected = [...coreSelection.selected, ...restSelection.selected]
    // During migration, old clients may still have only legacy `memories`.
    // They are reference-only here: v2 source attribution deliberately never
    // invents a memoryItemId for a legacy row.
    const legacyByScope =
      !savedMemoryEnabled || (selected.length && !args.preferLegacy)
      ? []
      : await Promise.all(
          scopeKeys.map(async (scopeKey) =>
            await ctx.db
              .query("memories")
              .withIndex("by_owner_id_and_scope_key_and_key", (q) =>
                q.eq("ownerId", owner._id).eq("scopeKey", scopeKey)
              )
              .take(100)
          )
        )
    const legacy = legacyByScope
      .flat()
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_RETRIEVED_MEMORY_ITEMS)
    const canUseHistory = owner.memoryHistoryEnabled
    const summaries =
      canUseHistory
        ? await ctx.db
            .query("conversationMemorySummaries")
            .withIndex("by_conversation_id", (q) =>
              q.eq("conversationId", conversation._id)
            )
            .take(1)
        : []
    const historyQuery = currentMessage
      ? currentMessage.content
          .replace(/[^\p{L}\p{N}_ -]/gu, " ")
          .trim()
          .slice(0, 200)
      : ""
    const matchingSummaries =
      canUseHistory && historyQuery
        ? await ctx.db
            .query("conversationMemorySummaries")
            .withSearchIndex("search_content", (q) =>
              q.search("content", historyQuery).eq("ownerId", owner._id)
            )
            .take(8)
        : []
    const summaryProjectIds = Array.from(
      new Set(
        matchingSummaries.flatMap((summary) =>
          summary.projectId ? [summary.projectId] : []
        )
      )
    )
    const summaryProjects = await Promise.all(
      summaryProjectIds.map(async (projectId) => await ctx.db.get(projectId))
    )
    const summaryProjectById = new Map(
      summaryProjects.filter((summaryProject) => summaryProject !== null).map(
        (summaryProject) => [summaryProject._id, summaryProject]
      )
    )
    const allowedHistory = matchingSummaries
      .filter(
        (summary) => {
          if (summary.conversationId === conversation._id) return false
          if (project?.memoryScope === "project_only")
            return summary.projectId === project._id
          if (!summary.projectId) return true
          const summaryProject = summaryProjectById.get(summary.projectId)
          return summaryProject?.memoryScope !== "project_only"
        }
      )
      .slice(0, 2)
    const allSummaries = [...summaries, ...allowedHistory]
    let remainingHistoryBudget =
      MEMORY_CONTEXT_TOKEN_BUDGET - coreSelection.used - restSelection.used
    const selectedSummaries = allSummaries.filter((summary) => {
      const cost = estimateMemoryTokens(summary.content)
      if (cost > remainingHistoryBudget) return false
      remainingHistoryBudget -= cost
      return true
    })
    const historyBudgetUsed =
      MEMORY_CONTEXT_TOKEN_BUDGET -
      coreSelection.used -
      restSelection.used -
      remainingHistoryBudget
    const summaryText = selectedSummaries
      .map((summary) => summary.content)
      .join("\n")
    const referenceText = buildMemoryContext(
      selected
        .filter((item) => item.category === "preference" || item.category === "workstyle")
        .map((item) => item.content)
        .concat(
          legacy
            .filter((item) => item.kind === "preference")
            .map((item) => item.content)
        ),
      [
        ...selected
          .filter(
            (item) => item.category === "core_profile" || item.category === "fact"
          )
          .map((item) => item.content),
        ...legacy
          .filter((item) => item.kind === "fact")
          .map((item) => item.content),
        ...(summaryText ? [`Conversation history summary: ${summaryText}`] : []),
      ]
    )
    const profile = await ctx.db
      .query("memoryProcessingProfiles")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", owner._id))
      .unique()
    const profileConnection = profile
      ? await ctx.db.get(profile.providerConnectionId)
      : null
    const processingAvailable =
      profile?.status === "active" &&
      profileConnection?.ownerId === owner._id &&
      profileConnection.status === "connected"
    return {
      memoryMode,
      ...(project?.memoryScope === "project_only"
        ? { degradedReason: "project_only" as const }
        : !savedMemoryEnabled
          ? { degradedReason: "saved_memory_disabled" as const }
          : !processingAvailable
          ? { degradedReason: "processing_unavailable" as const }
          : {}),
      referenceText,
      selectedMemoryItemIds: selected.map((item) => item._id),
      historySummaryIds: selectedSummaries.map((summary) => summary._id),
      budgetUsed: coreSelection.used + restSelection.used + historyBudgetUsed,
    }
  },
})

export const recordResponseReferences = internalMutation({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    responseMessageId: v.id("messages"),
    memoryItemIds: v.array(v.id("memoryItems")),
    summaryIds: v.array(v.id("conversationMemorySummaries")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [conversation, response] = await Promise.all([
      ctx.db.get(args.conversationId),
      ctx.db.get(args.responseMessageId),
    ])
    if (
      !conversation ||
      conversation.ownerId !== args.ownerId ||
      !response ||
      response.conversationId !== conversation._id ||
      response.role !== "assistant" ||
      response.status !== "complete"
    ) {
      return null
    }
    const now = Date.now()
    for (const memoryItemId of args.memoryItemIds.slice(0, MAX_RETRIEVED_MEMORY_ITEMS)) {
      const item = await ctx.db.get(memoryItemId)
      if (item?.ownerId !== args.ownerId || item.status !== "active") continue
      await ctx.db.insert("responseMemoryReferences", {
        ownerId: args.ownerId,
        conversationId: conversation._id,
        responseMessageId: response._id,
        memoryItemId: item._id,
        createdAt: now,
      })
    }
    for (const summaryId of args.summaryIds.slice(0, 2)) {
      const summary = await ctx.db.get(summaryId)
      if (summary?.ownerId !== args.ownerId)
        continue
      await ctx.db.insert("responseMemoryReferences", {
        ownerId: args.ownerId,
        conversationId: conversation._id,
        responseMessageId: response._id,
        summaryId: summary._id,
        createdAt: now,
      })
    }
    return null
  },
})

export const getRetrievalContext = internalQuery({
  args: {
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    currentMessageId: v.optional(v.id("messages")),
  },
  returns: retrievalContextValidator,
  handler: async (ctx, args) => {
    if (!args.currentMessageId) return null
    const [owner, conversation, currentMessage] = await Promise.all([
      ctx.db.get(args.ownerId),
      ctx.db.get(args.conversationId),
      ctx.db.get(args.currentMessageId),
    ])
    if (
      !owner ||
      !conversation ||
      conversation.ownerId !== owner._id ||
      conversation.memoryMode === "off" ||
      !currentMessage ||
      currentMessage.conversationId !== conversation._id ||
      currentMessage.role !== "user" ||
      currentMessage.status !== "complete"
    ) {
      return null
    }
    const profile = await ctx.db
      .query("memoryProcessingProfiles")
      .withIndex("by_owner_id", (q) => q.eq("ownerId", owner._id))
      .unique()
    if (!profile || profile.status !== "active") return null
    const connection = await ctx.db.get(profile.providerConnectionId)
    if (
      !connection ||
      connection.ownerId !== owner._id ||
      connection.provider !== profile.provider ||
      connection.status !== "connected"
    ) {
      return null
    }
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (q) => q.eq("connectionId", connection._id))
      .unique()
    if (!credential) return null
    const project = conversation.projectId
      ? await ctx.db.get(conversation.projectId)
      : null
    if (conversation.projectId && (!project || project.ownerId !== owner._id))
      return null
    const includeUser = project?.memoryScope !== "project_only"
    const recentMessages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) => q.eq("conversationId", conversation._id))
      .order("desc")
      .take(12)
    const query = recentMessages
      .filter((message) => message.role === "user" && message.status === "complete")
      .slice(0, 3)
      .reverse()
      .map((message) => message.content)
      .join("\n")
      .slice(0, 6_000)
    if (!query) return null
    return {
      ciphertext: credential.ciphertext,
      iv: credential.iv,
      provider: profile.provider,
      profileId: profile._id,
      profileRevision: profile.policyRevision,
      ownerId: owner._id,
      searchScopes: [
        ...(includeUser
          ? [`${owner._id}:user:profile:${profile.policyRevision}`]
          : []),
        ...(project
          ? [`${owner._id}:project:${project._id}:profile:${profile.policyRevision}`]
          : []),
      ],
      query,
    }
  },
})

export const hydrateSearchDocuments = internalQuery({
  args: {
    ownerId: v.id("users"),
    profileId: v.id("memoryProcessingProfiles"),
    profileRevision: v.number(),
    searchDocumentIds: v.array(v.id("memorySearchDocuments")),
  },
  returns: v.array(
    v.object({
      memoryItemId: v.id("memoryItems"),
      content: v.string(),
      category: v.union(
        v.literal("core_profile"),
        v.literal("preference"),
        v.literal("fact"),
        v.literal("workstyle")
      ),
    })
  ),
  handler: async (ctx, args) => {
    const results = []
    for (const searchDocumentId of args.searchDocumentIds.slice(0, 16)) {
      const document = await ctx.db.get(searchDocumentId)
      if (
        !document ||
        document.ownerId !== args.ownerId ||
        document.profileId !== args.profileId ||
        document.profileRevision !== args.profileRevision
      ) {
        continue
      }
      const item = await ctx.db.get(document.memoryItemId)
      if (
        !item ||
        item.ownerId !== args.ownerId ||
        item.status !== "active" ||
        item.confirmation !== "confirmed" ||
        item.sensitivity !== "normal" ||
        item.revision !== document.itemRevision ||
        item.content !== document.content
      ) {
        continue
      }
      results.push({
        memoryItemId: item._id,
        content: item.content,
        category: item.category,
      })
    }
    return results
  },
})

export const lexicalSearchDocuments = internalQuery({
  args: {
    ownerId: v.id("users"),
    profileId: v.id("memoryProcessingProfiles"),
    profileRevision: v.number(),
    scopeKeys: v.array(v.string()),
    query: v.string(),
  },
  returns: v.array(v.id("memorySearchDocuments")),
  handler: async (ctx, args) => {
    const phrase = args.query
      .replace(/[^\p{L}\p{N}_ -]/gu, " ")
      .trim()
      .slice(0, 200)
    if (!phrase) return []
    const results = await Promise.all(
      args.scopeKeys.slice(0, 2).map(async (scopeKey) =>
        await ctx.db
          .query("memorySearchDocuments")
          .withSearchIndex("search_content", (q) =>
            q
              .search("content", phrase)
              .eq("ownerId", args.ownerId)
              .eq("scopeKey", scopeKey)
              .eq("profileRevision", args.profileRevision)
          )
          .take(8)
      )
    )
    return [...new Set(results.flat().map((document) => document._id))].slice(
      0,
      16
    )
  },
})
