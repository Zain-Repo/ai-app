"use node"

import { createHash } from "node:crypto"

import { createOpenAI } from "@ai-sdk/openai"
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { OpenRouterChatSettings } from "@openrouter/ai-sdk-provider"
import {
  APICallError,
  generateText,
  Output,
  stepCountIs,
  streamText,
  tool,
} from "ai"
import type { ModelMessage } from "ai"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { env, internalAction } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import { MAX_ATTACHMENT_BYTES } from "./attachmentPolicy"
import {
  buildMemoryContext,
  MEMORY_EXTRACTION_MODEL,
  memoryExtractionInstructions,
  memoryExtractionSchema,
  parseMemoryExtraction,
  selectRelevantMemoryFacts,
} from "./memoryPolicy"
import type { MemoryCandidate } from "./memoryPolicy"
import {
  createProviderEmbeddings,
  getPrivateOpenRouterEmbeddingSettings,
  ProviderEmbeddingError,
} from "./providerEmbeddings"
import {
  buildProjectRetrievalContext,
  chunkProjectSourceText,
  MAX_PROJECT_SOURCE_CHUNKS,
  MAX_PROJECT_SOURCE_TEXT_CHARS,
} from "./projectEmbeddingPolicy"
import { decryptProviderToken } from "./providerCrypto"
import {
  createTerminalSandboxSession,
  runTerminalCommandInputSchema,
  runTerminalCommandTool,
} from "./terminalSandbox"
import { finishTerminalRun, startTerminalRun } from "./terminalPolicy"
import type { StoredTerminalRun } from "./terminalPolicy"
import {
  RENDER_UI_TOOL_NAME,
  renderUiToolDescription,
  renderUiToolInputSchema,
  serializeGenerativeUi,
} from "../shared/generative-ui"
import { terminalExecuteResponseSchema } from "../shared/terminal-workspace"

const MAX_RESPONSE_LENGTH = 32_000
const STREAM_FLUSH_INTERVAL_MS = 80
const MEMORY_REQUEST_TIMEOUT_MS = 30_000
const MAX_GENERATED_TITLE_LENGTH = 40
const MAX_GENERATED_TITLE_WORDS = 5
const OPENAI_TITLE_MODEL = "gpt-4o-mini"
const OPENROUTER_TITLE_MODEL = `openai/${OPENAI_TITLE_MODEL}`
const MAX_RELEVANT_MEMORIES = 8
const MIN_MEMORY_SCORE = 0.35
const MAX_RELEVANT_PROJECT_CHUNKS = 8
const MIN_PROJECT_CHUNK_SCORE = 0.3
const PROJECT_EMBEDDING_BATCH_SIZE = 32
const MAX_INLINE_TEXT_ATTACHMENT_CHARS = 500_000
const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images"
const IMAGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4
const IMAGE_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
])
const GENERATED_IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
])
const renderUiTool = tool({
  description: renderUiToolDescription,
  inputSchema: renderUiToolInputSchema,
})
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

class OpenRouterImageError extends Error {
  constructor(readonly statusCode: number) {
    super("OpenRouter image generation failed")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function parseOpenRouterImageResponse(value: unknown) {
  const image =
    isRecord(value) && Array.isArray(value.data) && isRecord(value.data[0])
      ? value.data[0]
      : null
  const base64 = image?.b64_json
  const contentType =
    typeof image?.media_type === "string" ? image.media_type : "image/webp"
  const extension = GENERATED_IMAGE_EXTENSIONS.get(contentType)
  if (
    typeof base64 !== "string" ||
    !base64 ||
    base64.length > MAX_IMAGE_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
    !extension
  ) {
    throw new Error("Provider returned an invalid image")
  }

  const bytes = Uint8Array.from(Buffer.from(base64, "base64"))
  if (!bytes.length || bytes.byteLength > MAX_ATTACHMENT_BYTES)
    throw new Error("Provider returned an invalid image")
  return { bytes, contentType, extension }
}

async function generateOpenRouterImage(
  token: string,
  options: {
    messages: ProviderMessage[]
    model: string
    prompt: string
    routingProvider?: string
  }
) {
  const latestUserMessage = options.messages.findLast(
    (message) => message.role === "user"
  )
  const inputReferences = (latestUserMessage?.attachments ?? []).flatMap(
    (attachment) =>
      IMAGE_TYPES.has(attachment.contentType)
        ? [
            {
              type: "image_url" as const,
              image_url: { url: attachment.url },
            },
          ]
        : []
  )
  const provider = getProviderRouting(options.model, options.routingProvider)
  const response = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      n: 1,
      size: "1K",
      output_format: "webp",
      ...(inputReferences.length ? { input_references: inputReferences } : {}),
      ...(provider ? { provider } : {}),
    }),
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
  })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new OpenRouterImageError(response.status)
  return parseOpenRouterImageResponse(result)
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
  routingProvider?: string
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
    },
  }
}

export { getPrivateOpenRouterEmbeddingSettings }

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

export function addGenerationContexts(
  messages: ProviderMessage[],
  memoryContext: string,
  projectSourceContext: string
) {
  const messagesWithMemory = messages.map((message, index) =>
    index === 0 && message.role === "system" && memoryContext
      ? { ...message, content: `${message.content}${memoryContext}` }
      : message
  )
  if (!projectSourceContext) return messagesWithMemory

  const latestUserIndex = messagesWithMemory.findLastIndex(
    (message) => message.role === "user"
  )
  const insertionIndex =
    latestUserIndex === -1 ? messagesWithMemory.length : latestUserIndex
  return [
    ...messagesWithMemory.slice(0, insertionIndex),
    {
      content: `Reference context for the next user request:${projectSourceContext}`,
      role: "user" as const,
    },
    ...messagesWithMemory.slice(insertionIndex),
  ]
}

export function addProjectSourceFallbackAttachments(
  messages: ProviderMessage[],
  fallbackAttachments: NonNullable<ProviderMessage["attachments"]>
) {
  if (!fallbackAttachments.length) return messages
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === "user"
  )
  if (latestUserIndex === -1)
    return [
      {
        attachments: fallbackAttachments,
        content: "Use the attached project sources as reference material.",
        role: "user" as const,
      },
      ...messages,
    ]
  return messages.map((message, index) =>
    index === latestUserIndex
      ? {
          ...message,
          attachments: [...(message.attachments ?? []), ...fallbackAttachments],
        }
      : message
  )
}

export function toModelPrompt(messages: ProviderMessage[]) {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")

  const modelMessages: ModelMessage[] = messages
    .filter((message) => message.role !== "system")
    .map((message) => {
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

  return {
    ...(instructions ? { instructions } : {}),
    messages: modelMessages,
  }
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
    return await createProviderEmbeddings(token, "openrouter", input)
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

function projectIndexErrorCode(cause: unknown) {
  const status =
    cause instanceof ProviderEmbeddingError ? cause.statusCode : undefined
  if (status === 401 || status === 403) return "needs_reauthentication" as const
  if (status === 402) return "insufficient_credits" as const
  return "indexing_failed" as const
}

export async function readProjectSourceForIndexing(blob: Blob) {
  const hash = createHash("sha256")
  const decoder = new TextDecoder()
  const reader = blob.stream().getReader()
  let indexedText = ""
  let textWasTruncated = false

  const appendIndexedText = (text: string) => {
    const remaining = MAX_PROJECT_SOURCE_TEXT_CHARS - indexedText.length
    if (text.length > remaining) textWasTruncated = true
    if (remaining > 0) indexedText += text.slice(0, remaining)
  }

  try {
    let streamComplete = false
    while (!streamComplete) {
      const readResult = await reader.read()
      streamComplete = readResult.done
      if (!readResult.done) {
        hash.update(readResult.value)
        appendIndexedText(decoder.decode(readResult.value, { stream: true }))
      }
    }
  } finally {
    reader.releaseLock()
  }
  appendIndexedText(decoder.decode())

  return {
    indexedText,
    sourceFingerprint: hash.digest("hex"),
    textWasTruncated,
  }
}

export const indexProjectSource = internalAction({
  args: { stateId: v.id("projectSourceIndexStates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    let connectionId: Id<"providerConnections"> | undefined
    try {
      const started = await ctx.runMutation(
        internal.projectEmbeddings.setProjectSourceIndexStatus,
        { stateId: args.stateId, status: "extracting" }
      )
      if (!started) return null
      const context = await ctx.runQuery(
        internal.projectEmbeddings.getProjectSourceIndexingContext,
        args
      )
      if (!context) return null
      if (context.kind === "error") {
        if (context.connectionId)
          await ctx.runMutation(
            internal.providerConnections.markProviderNeedsAuthentication,
            { connectionId: context.connectionId }
          )
        await ctx.runMutation(
          internal.projectEmbeddings.failProjectSourceIndex,
          {
            stateId: args.stateId,
            errorCode: context.errorCode,
          }
        )
        return null
      }
      connectionId = context.connectionId
      const blob = await ctx.storage.get(context.storageId)
      if (!blob) throw new Error("Project source storage unavailable")
      const { indexedText, sourceFingerprint, textWasTruncated } =
        await readProjectSourceForIndexing(blob)
      const chunks = chunkProjectSourceText(indexedText)
      if (!chunks.length) {
        await ctx.runMutation(
          internal.projectEmbeddings.failProjectSourceIndex,
          { stateId: args.stateId, errorCode: "unsupported" }
        )
        return null
      }
      const partial =
        textWasTruncated || chunks.length === MAX_PROJECT_SOURCE_CHUNKS
      const stillCurrent = await ctx.runMutation(
        internal.projectEmbeddings.setProjectSourceIndexStatus,
        { stateId: args.stateId, status: "indexing" }
      )
      if (!stillCurrent) return null
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        context.provider
      )
      const embeddings: number[][] = []
      for (
        let index = 0;
        index < chunks.length;
        index += PROJECT_EMBEDDING_BATCH_SIZE
      ) {
        embeddings.push(
          ...(await createProviderEmbeddings(
            token,
            context.provider,
            chunks.slice(index, index + PROJECT_EMBEDDING_BATCH_SIZE)
          ))
        )
      }
      await ctx.runMutation(
        internal.projectEmbeddings.applyProjectSourceChunks,
        {
          stateId: args.stateId,
          sourceFingerprint,
          partial,
          chunks: chunks.map((content, chunkIndex) => ({
            chunkIndex,
            content,
            embedding: embeddings[chunkIndex],
          })),
        }
      )
    } catch (cause) {
      const errorCode = projectIndexErrorCode(cause)
      if (connectionId && errorCode === "needs_reauthentication")
        await ctx.runMutation(
          internal.providerConnections.markProviderNeedsAuthentication,
          { connectionId }
        )
      await ctx.runMutation(internal.projectEmbeddings.failProjectSourceIndex, {
        stateId: args.stateId,
        errorCode,
      })
    }
    return null
  },
})

async function retrieveRelevantProjectSources(
  ctx: ActionCtx,
  args: {
    ownerId: Id<"users">
    projectId?: Id<"projects">
    query: string
  }
) {
  if (!args.projectId || !args.query.trim()) return ""
  let connectionId: Id<"providerConnections"> | undefined
  try {
    const context = await ctx.runQuery(
      internal.projectEmbeddings.getProjectRetrievalContext,
      { ownerId: args.ownerId, projectId: args.projectId }
    )
    if (!context) return ""
    connectionId = context.connectionId
    const token = await decryptProviderToken(
      context.ciphertext,
      context.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY,
      context.provider
    )
    const [embedding] = await createProviderEmbeddings(
      token,
      context.provider,
      [args.query]
    )
    const hits = await ctx.vectorSearch("projectSourceChunks", "by_embedding", {
      vector: embedding,
      limit: MAX_RELEVANT_PROJECT_CHUNKS,
      filter: (query) => query.eq("searchScope", context.searchScope),
    })
    const relevantHits = hits.filter(
      (hit) => hit._score >= MIN_PROJECT_CHUNK_SCORE
    )
    if (!relevantHits.length) return ""
    const chunks = await ctx.runQuery(
      internal.projectEmbeddings.hydrateProjectSearchResults,
      {
        ownerId: args.ownerId,
        projectId: args.projectId,
        profileId: context.profileId,
        profileRevision: context.profileRevision,
        chunkIds: relevantHits.map((hit) => hit._id),
      }
    )
    return buildProjectRetrievalContext(chunks)
  } catch (cause) {
    if (
      connectionId &&
      cause instanceof ProviderEmbeddingError &&
      (cause.statusCode === 401 || cause.statusCode === 403)
    )
      await ctx.runMutation(
        internal.providerConnections.markProviderNeedsAuthentication,
        { connectionId }
      )
    return ""
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
    let terminalRuns: StoredTerminalRun[] = []
    let uiPayload: string | undefined
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
      if (context.outputMode === "image") {
        if (context.provider !== "openrouter")
          throw new Error("Image generation requires OpenRouter")
        const image = await generateOpenRouterImage(token, {
          messages: context.messages,
          model: context.model,
          prompt: context.lastUserMessage,
          routingProvider: context.routingProvider,
        })
        const storageId = await ctx.storage.store(
          new Blob([image.bytes], { type: image.contentType })
        )
        try {
          await ctx.runMutation(
            internal.conversations.finishOpenRouterResponse,
            {
              assistantMessageId: args.assistantMessageId,
              attachments: [
                {
                  storageId,
                  name: `generated-image.${image.extension}`,
                  contentType: image.contentType,
                  size: image.bytes.byteLength,
                },
              ],
              content: "",
              failed: false,
            }
          )
        } catch (cause) {
          await ctx.storage.delete(storageId)
          throw cause
        }
        return null
      }
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
      const projectSourceContext = await retrieveRelevantProjectSources(ctx, {
        ownerId: context.memoryOwnerId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
        query: context.lastUserMessage,
      })
      const messagesWithProjectSourceFallback = projectSourceContext
        ? context.messages
        : addProjectSourceFallbackAttachments(
            context.messages,
            context.projectSourceFallbackAttachments
          )
      const hydratedMessages = await inlineTextAttachments(
        messagesWithProjectSourceFallback,
        async (storageId) => await ctx.storage.get(storageId)
      )
      const messages = addGenerationContexts(
        hydratedMessages,
        memoryContext,
        projectSourceContext
      )
      const prompt = toModelPrompt(messages)
      const terminalSandbox = createTerminalSandboxSession({
        conversationId: args.conversationId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
        workerToken: env.TERMINAL_WORKER_TOKEN,
        workerUrl: env.TERMINAL_WORKER_URL,
      })
      const generationPrompt = terminalSandbox
        ? {
            ...prompt,
            instructions: [prompt.instructions, terminalSandbox.description]
              .filter(Boolean)
              .join("\n\n"),
          }
        : prompt
      const terminalOptions = terminalSandbox
        ? {
            experimental_sandbox: terminalSandbox,
            stopWhen: stepCountIs(6),
          }
        : {}
      const result =
        context.provider === "openrouter"
          ? (() => {
              const openrouter = createOpenRouter({
                apiKey: token,
                compatibility: "strict",
              })
              return streamText({
                model: openrouter(
                  context.model,
                  getOpenRouterModelSettings(
                    context.model,
                    messages,
                    context.reasoningEffort,
                    context.routingProvider
                  )
                ),
                ...generationPrompt,
                tools: {
                  [RENDER_UI_TOOL_NAME]: renderUiTool,
                  ...(terminalSandbox
                    ? { runTerminalCommand: runTerminalCommandTool }
                    : {}),
                  ...(context.hasProjectLinks
                    ? {
                        webSearch: openrouter.tools.webSearch({
                          maxResults: 5,
                          searchPrompt:
                            "Use the exact project source URLs when they answer the request.",
                        }),
                      }
                    : {}),
                },
                ...terminalOptions,
                timeout: 120_000,
              })
            })()
          : (() => {
              const openai = createOpenAI({ apiKey: token })
              return streamText({
                model: openai.responses(context.model),
                ...generationPrompt,
                tools: {
                  [RENDER_UI_TOOL_NAME]: renderUiTool,
                  ...(terminalSandbox
                    ? { runTerminalCommand: runTerminalCommandTool }
                    : {}),
                  ...(context.hasProjectLinks
                    ? { webSearch: openai.tools.webSearch() }
                    : {}),
                },
                providerOptions: {
                  openai: getOpenAIOptions(context.reasoningEffort),
                },
                ...terminalOptions,
                timeout: 120_000,
              })
            })()

      await ctx.runMutation(internal.conversations.updateOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
      })
      let completed = false
      let lastFlushAt = 0
      const terminalStartedAt = new Map<string, number>()
      for await (const event of result.stream) {
        let terminalChanged = false
        let uiChanged = false
        if (event.type === "error") throw event.error
        if (event.type === "text-delta") {
          content += event.text
          if (content.length > MAX_RESPONSE_LENGTH)
            throw new Error("Provider response too long")
        }
        if (event.type === "reasoning-delta") {
          reasoning = (reasoning + event.text).slice(0, MAX_RESPONSE_LENGTH)
        }
        if (
          event.type === "tool-call" &&
          event.toolName === RENDER_UI_TOOL_NAME
        ) {
          const input = renderUiToolInputSchema.safeParse(event.input)
          const nextPayload = input.success
            ? serializeGenerativeUi(input.data.ui)
            : null
          if (nextPayload) {
            uiPayload = nextPayload
            uiChanged = true
          }
        }
        if (
          event.type === "tool-call" &&
          event.toolName === "runTerminalCommand"
        ) {
          const input = runTerminalCommandInputSchema.safeParse(event.input)
          if (input.success) {
            terminalRuns = startTerminalRun(terminalRuns, {
              command: input.data.command,
              toolCallId: event.toolCallId,
              ...(input.data.workingDirectory
                ? { workingDirectory: input.data.workingDirectory }
                : {}),
            })
            terminalStartedAt.set(event.toolCallId, Date.now())
            terminalChanged = true
          }
        }
        if (
          event.type === "tool-result" &&
          event.toolName === "runTerminalCommand"
        ) {
          const output = terminalExecuteResponseSchema.safeParse(event.output)
          if (output.success) {
            terminalRuns = finishTerminalRun(terminalRuns, event.toolCallId, {
              durationMs:
                Date.now() -
                (terminalStartedAt.get(event.toolCallId) ?? Date.now()),
              exitCode: output.data.exitCode,
              status: output.data.exitCode === 0 ? "complete" : "failed",
              stderr: output.data.stderr,
              stdout: output.data.stdout,
            })
            terminalChanged = true
          }
        }
        if (
          event.type === "tool-error" &&
          event.toolName === "runTerminalCommand"
        ) {
          terminalRuns = finishTerminalRun(terminalRuns, event.toolCallId, {
            durationMs:
              Date.now() -
              (terminalStartedAt.get(event.toolCallId) ?? Date.now()),
            status: "failed",
            stderr: "Terminal command failed before producing a result.",
          })
          terminalChanged = true
        }
        if (event.type === "finish") completed = true
        if (
          terminalChanged ||
          uiChanged ||
          event.type === "text-delta" ||
          event.type === "reasoning-delta"
        ) {
          const now = Date.now()
          if (
            terminalChanged ||
            uiChanged ||
            now - lastFlushAt >= STREAM_FLUSH_INTERVAL_MS
          ) {
            await ctx.runMutation(
              internal.conversations.updateOpenRouterResponse,
              {
                assistantMessageId: args.assistantMessageId,
                content,
                ...(reasoning.trim()
                  ? { reasoningSteps: [reasoning.trim()] }
                  : {}),
                ...(terminalRuns.length ? { terminalRuns } : {}),
                ...(uiPayload ? { uiPayload } : {}),
              }
            )
            lastFlushAt = now
          }
        }
      }
      content = content.trim()
      if (!completed || (!content && !uiPayload && !terminalRuns.length))
        throw new Error("Provider response incomplete")

      await ctx.runMutation(internal.conversations.finishOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
        failed: false,
        ...(reasoning.trim() ? { reasoningSteps: [reasoning.trim()] } : {}),
        ...(terminalRuns.length ? { terminalRuns } : {}),
        ...(uiPayload ? { uiPayload } : {}),
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
      const status =
        apiError?.statusCode ??
        (cause instanceof OpenRouterImageError ? cause.statusCode : undefined)
      if (connectionId && (status === 401 || status === 403)) {
        await ctx.runMutation(
          internal.providerConnections.markProviderNeedsAuthentication,
          { connectionId }
        )
      }
      if (provider === "openrouter" && status === 402)
        errorCode = "insufficient_credits"
      if (status) console.error("Provider request failed", { provider, status })
      terminalRuns = terminalRuns.map((run) =>
        run.status === "running"
          ? {
              ...run,
              status: "failed" as const,
              stderr: "Response ended before the command completed.",
            }
          : run
      )
      await ctx.runMutation(internal.conversations.finishOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
        ...(errorCode ? { errorCode } : {}),
        failed: true,
        ...(reasoning.trim() ? { reasoningSteps: [reasoning.trim()] } : {}),
        ...(terminalRuns.length ? { terminalRuns } : {}),
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
