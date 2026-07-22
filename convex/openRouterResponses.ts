"use node"

import {
  createOpenAI,
  type OpenAILanguageModelResponsesOptions,
} from "@ai-sdk/openai"
import {
  createOpenRouter,
  type OpenRouterChatSettings,
  type OpenRouterEmbeddingSettings,
} from "@openrouter/ai-sdk-provider"
import {
  APICallError,
  embedMany,
  generateText,
  Output,
  streamText,
  type ModelMessage,
} from "ai"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { env, internalAction } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import {
  buildMemoryContext,
  MEMORY_EMBEDDING_DIMENSIONS,
  MEMORY_EMBEDDING_MODEL,
  MEMORY_EXTRACTION_MODEL,
  memoryExtractionInstructions,
  memoryExtractionSchema,
  parseMemoryExtraction,
  selectRelevantMemoryFacts,
} from "./memoryPolicy"
import type { MemoryCandidate } from "./memoryPolicy"
import { decryptProviderToken } from "./providerCrypto"

const MAX_RESPONSE_LENGTH = 32_000
const STREAM_FLUSH_INTERVAL_MS = 80
const MEMORY_REQUEST_TIMEOUT_MS = 30_000
const MAX_GENERATED_TITLE_LENGTH = 40
const MAX_GENERATED_TITLE_WORDS = 5
const OPENAI_TITLE_MODEL = "gpt-4o-mini"
const OPENROUTER_TITLE_MODEL = `openai/${OPENAI_TITLE_MODEL}`
const MAX_RELEVANT_MEMORIES = 8
const MIN_MEMORY_SCORE = 0.35
const MAX_INLINE_TEXT_ATTACHMENT_CHARS = 500_000
const IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])
const DEEPSEEK_PROVIDER_ROUTING = {
  sort: { by: "price", partition: "model" },
  // Prefer the cheapest endpoint whose recent p90 latency stays under 3s.
  preferred_max_latency: { p90: 3 },
  allow_fallbacks: true,
  data_collection: "deny",
  require_parameters: true,
} as const
const CHEAPEST_PROVIDER_ROUTING = {
  sort: "price",
  allow_fallbacks: true,
  data_collection: "deny",
  require_parameters: true,
} as const
const PRIVATE_PROVIDER_ROUTING = {
  data_collection: "deny",
  require_parameters: true,
  zdr: true,
} as const

type ReasoningEffort =
  "max" | "xhigh" | "high" | "medium" | "low" | "minimal" | "none"

type ProviderMessage = {
  attachments?: Array<{
    contentType: string
    name: string
    size?: number
    storageId?: Id<"_storage">
    url: string
  }>
  content: string
  role: "system" | "user" | "assistant"
}

function getProviderRouting(model: string, routingProvider?: string) {
  if (routingProvider === "auto") return CHEAPEST_PROVIDER_ROUTING
  if (routingProvider) {
    return {
      order: [routingProvider],
      allow_fallbacks: false,
      data_collection: "deny",
      require_parameters: true,
    } as const
  }
  return model.startsWith("deepseek/") ? DEEPSEEK_PROVIDER_ROUTING : undefined
}

function asReasoningEffort(value?: string): ReasoningEffort | undefined {
  return ["max", "xhigh", "high", "medium", "low", "minimal", "none"].includes(
    value ?? ""
  )
    ? (value as ReasoningEffort)
    : undefined
}

export function getOpenRouterModelSettings(
  model: string,
  messages: ProviderMessage[],
  reasoningEffort?: string,
  routingProvider?: string,
  enableWebFetch = false
): OpenRouterChatSettings {
  const provider = getProviderRouting(model, routingProvider)
  const effort = asReasoningEffort(reasoningEffort)
  return {
    ...(messages.some((message) =>
      message.attachments?.some(
        (attachment) => attachment.contentType === "application/pdf"
      )
    )
      ? { plugins: [{ id: "file-parser" as const }] }
      : {}),
    ...(effort
      ? {
          reasoning: {
            effort: effort === "max" ? ("xhigh" as const) : effort,
          },
        }
      : {}),
    extraBody: {
      store: false,
      ...(provider ? { provider } : {}),
      ...(enableWebFetch
        ? {
            tools: [
              {
                type: "openrouter:web_fetch",
                parameters: { max_content_tokens: 12_000 },
              },
            ],
          }
        : {}),
    },
  }
}

export function getPrivateOpenRouterEmbeddingSettings(): OpenRouterEmbeddingSettings {
  return {
    extraBody: {
      dimensions: MEMORY_EMBEDDING_DIMENSIONS,
      encoding_format: "float",
      provider: PRIVATE_PROVIDER_ROUTING,
    },
  }
}

function getPrivateOpenRouterModelSettings(): OpenRouterChatSettings {
  return {
    extraBody: { provider: PRIVATE_PROVIDER_ROUTING, store: false },
    structuredOutputs: { strict: true },
  }
}

function getOpenAIOptions(
  reasoningEffort?: string
): OpenAILanguageModelResponsesOptions {
  const effort = asReasoningEffort(reasoningEffort)
  return {
    store: false,
    ...(effort
      ? { reasoningEffort: effort, reasoningSummary: "auto" as const }
      : {}),
  }
}

function isTextAttachment(contentType: string) {
  return (
    contentType.startsWith("text/") ||
    [
      "application/javascript",
      "application/json",
      "application/ld+json",
      "application/xml",
    ].includes(contentType)
  )
}

export async function inlineTextAttachments(
  messages: ProviderMessage[],
  read: (storageId: Id<"_storage">) => Promise<Blob | null>
) {
  let remaining = MAX_INLINE_TEXT_ATTACHMENT_CHARS
  const hydrated: ProviderMessage[] = []

  for (const message of messages) {
    const attachments: NonNullable<ProviderMessage["attachments"]> = []
    const textFiles: string[] = []
    for (const attachment of message.attachments ?? []) {
      if (!attachment.storageId || !isTextAttachment(attachment.contentType)) {
        attachments.push(attachment)
        continue
      }

      const blob = await read(attachment.storageId)
      const text = blob ? await blob.text() : ""
      const excerpt = text.slice(0, remaining)
      remaining -= excerpt.length
      textFiles.push(
        `Referenced file ${JSON.stringify(attachment.name)}:\n--- BEGIN FILE ---\n${excerpt}${
          excerpt.length < text.length ? "\n[File truncated]" : ""
        }\n--- END FILE ---`
      )
    }
    hydrated.push({
      ...message,
      attachments,
      content: [message.content, ...textFiles].filter(Boolean).join("\n\n"),
    })
  }
  return hydrated
}

export function toModelMessages(messages: ProviderMessage[]): ModelMessage[] {
  return messages.map((message) => {
    if (message.role !== "user" || !message.attachments?.length)
      return { content: message.content, role: message.role }

    return {
      role: "user",
      content: [
        { type: "text", text: message.content },
        ...message.attachments.map((attachment) =>
          IMAGE_TYPES.has(attachment.contentType)
            ? {
                type: "image" as const,
                image: new URL(attachment.url),
                mediaType: attachment.contentType,
              }
            : {
                type: "file" as const,
                data: new URL(attachment.url),
                filename: attachment.name,
                mediaType: attachment.contentType,
              }
        ),
      ],
    }
  })
}

const titleInstructions = `Summarize the user's prompt as a simple chat title.
Use 2 to ${MAX_GENERATED_TITLE_WORDS} words and at most ${MAX_GENERATED_TITLE_LENGTH} characters.
Return only the title with no quotes, label, markdown, or ending punctuation.`

export function normalizeGeneratedTitle(value: string) {
  const title = (value.trim().split(/\r?\n/, 1)[0] ?? "")
    .replace(/^#+\s*/, "")
    .replace(/^["'`*_~]+|["'`*_~]+$/g, "")
    .replace(/^(?:chat\s+)?title:\s*/i, "")
    .replace(/^["'`*_~]+|["'`*_~]+$/g, "")
    .replace(/[.!?;:]+$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, MAX_GENERATED_TITLE_WORDS)
    .join(" ")
  if (title.length <= MAX_GENERATED_TITLE_LENGTH) return title
  const shortened = title.slice(0, MAX_GENERATED_TITLE_LENGTH)
  const lastSpace = shortened.lastIndexOf(" ")
  return lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened
}

async function createEmbeddings(token: string, input: string[]) {
  if (!input.length) return []
  try {
    const openrouter = createOpenRouter({
      apiKey: token,
      compatibility: "strict",
    })
    const { embeddings } = await embedMany({
      model: openrouter.textEmbeddingModel(
        MEMORY_EMBEDDING_MODEL,
        getPrivateOpenRouterEmbeddingSettings()
      ),
      values: input,
      abortSignal: AbortSignal.timeout(MEMORY_REQUEST_TIMEOUT_MS),
    })
    return embeddings.length === input.length &&
      embeddings.every(
        (embedding) =>
          embedding.length === MEMORY_EMBEDDING_DIMENSIONS &&
          embedding.every(Number.isFinite)
      )
      ? embeddings
      : null
  } catch {
    return null
  }
}

async function isMemoryEnabled(
  ctx: ActionCtx,
  ownerId: Id<"users">,
  memoryRevision: number
) {
  try {
    return await ctx.runQuery(internal.memories.isEnabled, {
      memoryRevision,
      ownerId,
    })
  } catch {
    return false
  }
}

async function retrieveRelevantMemories(
  ctx: ActionCtx,
  token: string,
  context: {
    hasSearchableMemoryFacts: boolean
    lastUserMessage: string
    memoryEnabled: boolean
    memoryOwnerId: Id<"users">
    memorySearchScopes: string[]
    projectId?: Id<"projects">
  }
) {
  if (
    !context.memoryEnabled ||
    !context.hasSearchableMemoryFacts ||
    !context.memorySearchScopes.length
  )
    return []
  try {
    const embeddings = await createEmbeddings(token, [context.lastUserMessage])
    const embedding = embeddings?.[0]
    if (!embedding) return []
    const scopes = context.memorySearchScopes
    const hits = await ctx.vectorSearch("memories", "by_embedding", {
      vector: embedding,
      limit: MAX_RELEVANT_MEMORIES,
      filter: (query) =>
        scopes.length === 1
          ? query.eq("searchScope", scopes[0])
          : query.or(...scopes.map((scope) => query.eq("searchScope", scope))),
    })
    const relevantHits = hits.filter((hit) => hit._score >= MIN_MEMORY_SCORE)
    if (!relevantHits.length) return []
    const memories = await ctx.runQuery(
      internal.memories.hydrateSearchResults,
      {
        memoryIds: relevantHits.map((hit) => hit._id),
        ownerId: context.memoryOwnerId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
      }
    )
    return selectRelevantMemoryFacts(memories)
  } catch {
    return []
  }
}

async function extractAndStoreMemories(
  ctx: ActionCtx,
  token: string,
  args: {
    conversationId: Id<"conversations">
    existingKeys: Array<{ key: string; scope: "user" | "project" }>
    latestUserMessage: string
    latestUserMessageCreatedAt: number
    latestUserMessageId: Id<"messages">
    memoryEnabled: boolean
    memoryRevision: number
    ownerId: Id<"users">
    projectId?: Id<"projects">
  }
) {
  if (
    !args.memoryEnabled ||
    !(await isMemoryEnabled(ctx, args.ownerId, args.memoryRevision))
  )
    return
  try {
    const openrouter = createOpenRouter({
      apiKey: token,
      compatibility: "strict",
    })
    const { output } = await generateText({
      model: openrouter(
        MEMORY_EXTRACTION_MODEL,
        getPrivateOpenRouterModelSettings()
      ),
      instructions: memoryExtractionInstructions,
      prompt: JSON.stringify({
        existingKeys: args.existingKeys,
        hasProject: Boolean(args.projectId),
        latestUserMessage: args.latestUserMessage,
      }),
      output: Output.object({
        name: "durable_memory_candidates",
        schema: memoryExtractionSchema,
      }),
      maxOutputTokens: 800,
      timeout: MEMORY_REQUEST_TIMEOUT_MS,
    })
    const extraction = parseMemoryExtraction(
      output,
      Boolean(args.projectId),
      args.existingKeys
    )
    if (!extraction.memories.length && !extraction.deletions.length) return
    const facts = extraction.memories.filter(
      (candidate) => candidate.kind === "fact"
    )
    const embeddings = await createEmbeddings(
      token,
      facts.map((candidate) => candidate.content)
    )
    let factIndex = 0
    const memories: Array<MemoryCandidate & { embedding?: number[] }> =
      extraction.memories.map((candidate) => {
        if (candidate.kind === "preference") return candidate
        const embedding = embeddings?.[factIndex]
        factIndex += 1
        return { ...candidate, ...(embedding ? { embedding } : {}) }
      })
    await ctx.runMutation(internal.memories.upsertExtracted, {
      deletions: extraction.deletions,
      memories,
      memoryRevision: args.memoryRevision,
      ownerId: args.ownerId,
      ...(args.projectId ? { projectId: args.projectId } : {}),
      sourceConversationId: args.conversationId,
      sourceMessageCreatedAt: args.latestUserMessageCreatedAt,
      sourceMessageId: args.latestUserMessageId,
    })
  } catch {
    // Memory is an optional enhancement; never make a completed chat fail.
  }
}

async function generateConversationTitle(
  ctx: ActionCtx,
  token: string,
  args: {
    conversationId: Id<"conversations">
    prompt: string
    provider: "openrouter" | "openai"
  }
) {
  try {
    const result =
      args.provider === "openrouter"
        ? await generateText({
            model: createOpenRouter({
              apiKey: token,
              compatibility: "strict",
            })(
              OPENROUTER_TITLE_MODEL,
              getOpenRouterModelSettings(
                OPENROUTER_TITLE_MODEL,
                [],
                undefined,
                "auto"
              )
            ),
            instructions: titleInstructions,
            prompt: args.prompt,
            maxOutputTokens: 40,
            timeout: MEMORY_REQUEST_TIMEOUT_MS,
          })
        : await generateText({
            model: createOpenAI({ apiKey: token }).responses(
              OPENAI_TITLE_MODEL
            ),
            instructions: titleInstructions,
            prompt: args.prompt,
            maxOutputTokens: 40,
            providerOptions: { openai: getOpenAIOptions() },
            timeout: MEMORY_REQUEST_TIMEOUT_MS,
          })
    const title = normalizeGeneratedTitle(result.text)
    if (title)
      await ctx.runMutation(internal.conversations.setGeneratedTitle, {
        conversationId: args.conversationId,
        title,
      })
  } catch {
    // Title generation is optional; keep the prompt-based fallback.
  }
}

export const generate = internalAction({
  args: {
    assistantMessageId: v.id("messages"),
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let connectionId: Id<"providerConnections"> | undefined
    let content = ""
    let provider: "openrouter" | "openai" | undefined
    let reasoning = ""
    let errorCode: "insufficient_credits" | undefined
    try {
      const context = await ctx.runQuery(
        internal.conversations.getOpenRouterResponseContext,
        args
      )
      connectionId = context.connectionId
      provider = context.provider
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        context.provider
      )
      const memoryEnabled =
        context.provider === "openrouter" &&
        context.memoryEnabled &&
        (await isMemoryEnabled(
          ctx,
          context.memoryOwnerId,
          context.memoryRevision
        ))
      const relevantMemories = await retrieveRelevantMemories(ctx, token, {
        ...context,
        memoryEnabled,
      })
      const memoryStillCurrent =
        memoryEnabled &&
        (await isMemoryEnabled(
          ctx,
          context.memoryOwnerId,
          context.memoryRevision
        ))
      const memoryContext = buildMemoryContext(
        memoryStillCurrent ? context.memoryPreferences : [],
        memoryStillCurrent ? relevantMemories : []
      )
      const hydratedMessages = await inlineTextAttachments(
        context.messages,
        async (storageId) => await ctx.storage.get(storageId)
      )
      const messages = hydratedMessages.map((message, index) =>
        index === 0 && message.role === "system" && memoryContext
          ? { ...message, content: `${message.content}${memoryContext}` }
          : message
      )
      const modelMessages = toModelMessages(messages)
      const result =
        context.provider === "openrouter"
          ? streamText({
              model: createOpenRouter({
                apiKey: token,
                compatibility: "strict",
              })(
                context.model,
                getOpenRouterModelSettings(
                  context.model,
                  messages,
                  context.reasoningEffort,
                  context.routingProvider,
                  context.hasProjectLinks
                )
              ),
              messages: modelMessages,
              timeout: 120_000,
            })
          : (() => {
              const openai = createOpenAI({ apiKey: token })
              return streamText({
                model: openai.responses(context.model),
                messages: modelMessages,
                ...(context.hasProjectLinks
                  ? { tools: { webSearch: openai.tools.webSearch() } }
                  : {}),
                providerOptions: {
                  openai: getOpenAIOptions(context.reasoningEffort),
                },
                timeout: 120_000,
              })
            })()

      await ctx.runMutation(internal.conversations.updateOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
      })
      let completed = false
      let lastFlushAt = 0
      for await (const event of result.stream) {
        if (event.type === "error") throw event.error
        if (event.type === "text-delta") {
          content += event.text
          if (content.length > MAX_RESPONSE_LENGTH)
            throw new Error("Provider response too long")
        }
        if (event.type === "reasoning-delta") {
          reasoning = (reasoning + event.text).slice(0, MAX_RESPONSE_LENGTH)
        }
        if (event.type === "finish") completed = true
        if (event.type === "text-delta" || event.type === "reasoning-delta") {
          const now = Date.now()
          if (now - lastFlushAt >= STREAM_FLUSH_INTERVAL_MS) {
            await ctx.runMutation(
              internal.conversations.updateOpenRouterResponse,
              {
                assistantMessageId: args.assistantMessageId,
                content,
                ...(reasoning.trim()
                  ? { reasoningSteps: [reasoning.trim()] }
                  : {}),
              }
            )
            lastFlushAt = now
          }
        }
      }
      content = content.trim()
      if (!completed || !content)
        throw new Error("Provider response incomplete")

      await ctx.runMutation(internal.conversations.finishOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
        failed: false,
        ...(reasoning.trim() ? { reasoningSteps: [reasoning.trim()] } : {}),
      })
      if (context.shouldGenerateTitle)
        await generateConversationTitle(ctx, token, {
          conversationId: args.conversationId,
          prompt: context.lastUserMessage,
          provider: context.provider,
        })
      if (context.provider === "openrouter")
        await extractAndStoreMemories(ctx, token, {
          conversationId: args.conversationId,
          existingKeys: context.memoryKeys,
          latestUserMessage: context.lastUserMessage,
          latestUserMessageCreatedAt: context.lastUserMessageCreatedAt,
          latestUserMessageId: context.lastUserMessageId,
          memoryEnabled: context.memoryEnabled,
          memoryRevision: context.memoryRevision,
          ownerId: context.memoryOwnerId,
          ...(context.projectId ? { projectId: context.projectId } : {}),
        })
      return null
    } catch (cause) {
      const apiError = APICallError.isInstance(cause) ? cause : undefined
      const status = apiError?.statusCode
      if (connectionId && (status === 401 || status === 403)) {
        await ctx.runMutation(
          internal.providerConnections.markProviderNeedsAuthentication,
          { connectionId }
        )
      }
      if (provider === "openrouter" && status === 402)
        errorCode = "insufficient_credits"
      if (status) console.error("Provider request failed", { provider, status })
      await ctx.runMutation(internal.conversations.finishOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
        ...(errorCode ? { errorCode } : {}),
        failed: true,
        ...(reasoning.trim() ? { reasoningSteps: [reasoning.trim()] } : {}),
      })
      throw new Error("Provider response failed")
    }
  },
})

export const embedMemory = internalAction({
  args: { content: v.string(), memoryId: v.id("memories") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const context = await ctx.runQuery(
        internal.memories.getEmbeddingContext,
        args
      )
      if (!context) return null
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY
      )
      const embeddings = await createEmbeddings(token, [args.content])
      const embedding = embeddings?.[0]
      if (!embedding) return null
      await ctx.runMutation(internal.memories.applyEmbedding, {
        ...args,
        embedding,
      })
    } catch {
      // Edited facts remain visible in settings and can be re-embedded later.
    }
    return null
  },
})

export const embedMissingMemories = internalAction({
  args: {
    memoryIds: v.array(v.id("memories")),
    ownerId: v.id("users"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const context = await ctx.runQuery(
        internal.memories.getMissingEmbeddingContext,
        args
      )
      if (!context) return null
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY
      )
      const embeddings = await createEmbeddings(
        token,
        context.items.map((item) => item.content)
      )
      if (!embeddings) return null
      await ctx.runMutation(internal.memories.applyEmbeddings, {
        items: context.items.map((item, index) => ({
          ...item,
          embedding: embeddings[index],
        })),
        ownerId: args.ownerId,
      })
    } catch {
      // Missing vectors remain retryable on the next enable or edit.
    }
    return null
  },
})
