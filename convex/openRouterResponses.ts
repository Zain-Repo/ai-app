"use node"

import { createHash } from "node:crypto"

import { createOpenAI } from "@ai-sdk/openai"
import type { OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai"
import type { OpenRouterChatSettings } from "@openrouter/ai-sdk-provider"
import { APICallError, generateText, stepCountIs, streamText, tool } from "ai"
import type { ModelMessage } from "ai"
import { v } from "convex/values"
import { getDocumentProxy } from "unpdf"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, env, internalAction } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import { MAX_ATTACHMENT_BYTES } from "./attachmentPolicy"
import { readBoundedJson } from "./boundedJson"
import { FalApiError, generateFalImage } from "./fal"
import { buildProviderImageInput } from "./imageGenerationPolicy"
import { loadOpenRouterImageCapability } from "./imageModelCapabilities"
import {
  createProviderEmbeddings,
  getPrivateOpenRouterEmbeddingSettings,
  ProviderEmbeddingError,
} from "./providerEmbeddings"
import {
  getOpenRouterModelUrl,
  parseOpenRouterModelSupportsTools,
} from "./providerOAuth"
import {
  buildProjectRetrievalContext,
  chunkProjectSourceText,
  isPdfProjectSource,
  MAX_PROJECT_SOURCE_CHUNKS,
  MAX_PROJECT_SOURCE_TEXT_CHARS,
} from "./projectEmbeddingPolicy"
import { decryptProviderToken } from "./providerCrypto"
import { createUserOpenRouter } from "../shared/openrouter-provider"
import { aggregateOpenRouterUsage } from "../shared/provider-usage"
import {
  getImageOutputRange,
  getStaticImageModelCapability,
  validateImageGenerationConfig,
} from "../shared/image-generation"
import type {
  ImageGenerationConfig,
  ImageModelCapability,
} from "../shared/image-generation"
import {
  createTerminalSandboxSession,
  runTerminalCommandInputSchema,
  runTerminalCommandTool,
} from "./terminalSandbox"
import { finishTerminalRun, startTerminalRun } from "./terminalPolicy"
import {
  classifyOpenRouterAttachment,
  decodeOpenRouterTextAttachment,
  resolveOpenRouterAttachmentMediaType,
} from "../shared/openrouter-attachments"
import type { StoredTerminalRun } from "./terminalPolicy"
import {
  RENDER_UI_TOOL_NAME,
  renderUiToolDescription,
  renderUiToolInputSchema,
  serializeGenerativeUi,
} from "../shared/generative-ui"
import {
  CHAT_TITLE_INSTRUCTIONS,
  normalizeGeneratedChatTitle,
} from "../shared/chat-title"
import { terminalExecuteResponseSchema } from "../shared/terminal-workspace"

export { normalizeGeneratedChatTitle as normalizeGeneratedTitle } from "../shared/chat-title"

const MAX_RESPONSE_LENGTH = 32_000
const STREAM_FLUSH_INTERVAL_MS = 80
const TITLE_REQUEST_TIMEOUT_MS = 30_000
const OPENAI_TITLE_MODEL = "gpt-4o-mini"
const OPENROUTER_TITLE_MODEL = `openai/${OPENAI_TITLE_MODEL}`
const MAX_RELEVANT_PROJECT_CHUNKS = 8
const MIN_PROJECT_CHUNK_SCORE = 0.3
const PROJECT_EMBEDDING_BATCH_SIZE = 32
const MAX_PROJECT_PDF_PAGES = 250
const MAX_PROJECT_PDF_IMAGE_PIXELS = 16_777_216
const MAX_INLINE_TEXT_ATTACHMENT_CHARS = 500_000
const OPENROUTER_IMAGES_URL = "https://openrouter.ai/api/v1/images"
const MAX_OPENROUTER_MODEL_METADATA_BYTES = 512 * 1024
const OPENROUTER_MODEL_METADATA_TIMEOUT_MS = 5_000
const IMAGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const MAX_IMAGE_BASE64_LENGTH = Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3) + 4
const MAX_IMAGE_RESPONSE_JSON_BYTES = MAX_IMAGE_BASE64_LENGTH * 4 + 1024 * 1024
const GENERATED_IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
])

class ResponseStoppedError extends Error {
  constructor() {
    super("Response stopped by user")
  }
}

function timeoutSignal(milliseconds: number, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(milliseconds)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}
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

type DesktopCodexProjectSourceRequest = {
  ownerId: Id<"users">
  projectId: Id<"projects">
  query: string
}

type DesktopCodexMemoryContext = {
  budgetUsed: number
  degradedReason?: string
  historySummaryIds: Id<"conversationMemorySummaries">[]
  memoryMode: "standard" | "read_only" | "off"
  referenceText: string
  selectedMemoryItemIds: Id<"memoryItems">[]
}

const desktopCodexMemoryContextValidator = v.object({
  budgetUsed: v.number(),
  degradedReason: v.optional(v.string()),
  historySummaryIds: v.array(v.id("conversationMemorySummaries")),
  memoryMode: v.union(
    v.literal("standard"),
    v.literal("read_only"),
    v.literal("off")
  ),
  referenceText: v.string(),
  selectedMemoryItemIds: v.array(v.id("memoryItems")),
})

type ProjectRetrievalContext = {
  ciphertext: string
  iv: string
  connectionId: Id<"providerConnections">
  provider: "openrouter" | "openai"
  profileId: Id<"projectEmbeddingProfiles">
  profileRevision: number
  searchScope: string
}

type ProjectSourceChunk = {
  content: string
  name: string
}

type ChatTitleGenerationContext = {
  ciphertext: string
  connectionId: Id<"providerConnections">
  initialQuestion: string
  iv: string
  provider: "openrouter" | "openai"
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

function getImageProviderRouting(routingProvider?: string) {
  if (routingProvider === "auto")
    return { sort: "price", allow_fallbacks: true } as const
  if (routingProvider)
    return { order: [routingProvider], allow_fallbacks: false } as const
  return undefined
}

class OpenRouterImageError extends Error {
  constructor(readonly statusCode: number) {
    super("OpenRouter image generation failed")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

const OPENROUTER_ERROR_TYPES = new Set([
  "authentication",
  "content_policy_violation",
  "context_length_exceeded",
  "invalid_prompt",
  "invalid_request",
  "max_tokens_exceeded",
  "payment_required",
  "permission_denied",
  "provider_overloaded",
  "provider_unavailable",
  "rate_limit_exceeded",
  "refusal",
  "server",
  "string_too_long",
  "timeout",
  "token_limit_exceeded",
  "unmapped",
])

type ProviderFailureCode =
  | "authentication"
  | "insufficient_credits"
  | "rate_limited"
  | "request_blocked"
  | "invalid_request"
  | "provider_unavailable"
  | "generation_failed"

type ProviderFailure = {
  code: ProviderFailureCode
  errorType?: string
  needsAuthentication: boolean
  safeMessage: string
  status?: number
}

export function getSafeProviderFailureMessage(
  code: ProviderFailureCode,
  provider?: "openrouter" | "openai" | "fal"
) {
  const label =
    provider === "openrouter"
      ? "OpenRouter"
      : provider === "openai"
        ? "OpenAI"
        : provider === "fal"
          ? "Fal"
          : "The provider"
  switch (code) {
    case "authentication":
      return `${label} authentication failed. Reconnect the provider and try again.`
    case "insufficient_credits":
      return `${label} rejected the request because the account has insufficient credit.`
    case "rate_limited":
      return `${label} rate limit was reached. Try again shortly.`
    case "request_blocked":
      return `${label} blocked this request because of permissions or content policy. Review the request or provider settings and try again.`
    case "invalid_request":
      return `${label} rejected this request. Choose a compatible model or adjust the input and try again.`
    case "provider_unavailable":
      return `${label} is temporarily unavailable. Try again shortly or choose another model.`
    case "generation_failed":
      return `${label} could not complete this response. Try again or choose another model.`
  }
}

function readHttpStatus(value: unknown) {
  const status =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d{3}$/.test(value)
        ? Number(value)
        : undefined
  return status !== undefined && status >= 400 && status <= 599
    ? status
    : undefined
}

function readOpenRouterError(value: unknown) {
  const error = isRecord(value) && isRecord(value.error) ? value.error : value
  if (!isRecord(error)) return null
  const metadata = isRecord(error.metadata) ? error.metadata : undefined
  const rawErrorType = metadata?.error_type ?? error.error_type
  const errorType =
    typeof rawErrorType === "string" && OPENROUTER_ERROR_TYPES.has(rawErrorType)
      ? rawErrorType
      : undefined
  const status = readHttpStatus(error.code)
  return status !== undefined || errorType ? { errorType, status } : null
}

export function classifyProviderFailure(
  cause: unknown,
  provider?: "openrouter" | "openai" | "fal"
): ProviderFailure {
  const apiError = APICallError.isInstance(cause) ? cause : undefined
  const structuredError =
    provider === "openrouter"
      ? (readOpenRouterError(apiError?.data) ?? readOpenRouterError(cause))
      : null
  const status =
    apiError?.statusCode ??
    structuredError?.status ??
    (cause instanceof OpenRouterImageError || cause instanceof FalApiError
      ? cause.statusCode
      : undefined)
  const errorType = structuredError?.errorType
  const needsAuthentication = status === 401 || errorType === "authentication"

  if (needsAuthentication)
    return {
      code: "authentication",
      errorType,
      needsAuthentication,
      safeMessage: getSafeProviderFailureMessage("authentication", provider),
      ...(status === undefined ? {} : { status }),
    }
  if (status === 402 || errorType === "payment_required")
    return {
      code: "insufficient_credits",
      errorType,
      needsAuthentication: false,
      safeMessage: getSafeProviderFailureMessage(
        "insufficient_credits",
        provider
      ),
      ...(status === undefined ? {} : { status }),
    }
  if (status === 429 || errorType === "rate_limit_exceeded")
    return {
      code: "rate_limited",
      errorType,
      needsAuthentication: false,
      safeMessage: getSafeProviderFailureMessage("rate_limited", provider),
      ...(status === undefined ? {} : { status }),
    }
  if (
    status === 403 ||
    errorType === "permission_denied" ||
    errorType === "content_policy_violation" ||
    errorType === "refusal"
  )
    return {
      code: "request_blocked",
      errorType,
      needsAuthentication: false,
      safeMessage: getSafeProviderFailureMessage("request_blocked", provider),
      ...(status === undefined ? {} : { status }),
    }
  if (
    status === 400 ||
    status === 404 ||
    status === 413 ||
    status === 422 ||
    errorType === "context_length_exceeded" ||
    errorType === "invalid_prompt" ||
    errorType === "invalid_request" ||
    errorType === "max_tokens_exceeded" ||
    errorType === "string_too_long" ||
    errorType === "token_limit_exceeded"
  )
    return {
      code: "invalid_request",
      errorType,
      needsAuthentication: false,
      safeMessage: getSafeProviderFailureMessage("invalid_request", provider),
      ...(status === undefined ? {} : { status }),
    }
  if (
    (status !== undefined && status >= 500) ||
    errorType === "provider_overloaded" ||
    errorType === "provider_unavailable" ||
    errorType === "server" ||
    errorType === "timeout" ||
    errorType === "unmapped"
  )
    return {
      code: "provider_unavailable",
      errorType,
      needsAuthentication: false,
      safeMessage: getSafeProviderFailureMessage(
        "provider_unavailable",
        provider
      ),
      ...(status === undefined ? {} : { status }),
    }
  return {
    code: "generation_failed",
    errorType,
    needsAuthentication: false,
    safeMessage: getSafeProviderFailureMessage("generation_failed", provider),
    ...(status === undefined ? {} : { status }),
  }
}

export async function loadOpenRouterModelSupportsTools(
  token: string,
  model: string,
  signal?: AbortSignal
) {
  try {
    const response = await fetch(getOpenRouterModelUrl(model), {
      headers: { Authorization: `Bearer ${token}` },
      signal: timeoutSignal(OPENROUTER_MODEL_METADATA_TIMEOUT_MS, signal),
    })
    if (!response.ok) return false
    const value = await readBoundedJson(
      response,
      MAX_OPENROUTER_MODEL_METADATA_BYTES,
      "OpenRouter model metadata was invalid"
    )
    return parseOpenRouterModelSupportsTools(value) === true
  } catch {
    // Capability lookup must fail closed to universally supported plain text.
    return false
  }
}

export function selectOpenRouterTools<T extends Record<string, unknown>>(
  supportsTools: boolean,
  tools: T
) {
  return supportsTools ? tools : undefined
}

export function parseOpenRouterImageResponses(value: unknown) {
  if (!isRecord(value) || !Array.isArray(value.data))
    throw new Error("Provider returned an invalid image response")
  const images = value.data.slice(0, 4).map((candidate) => {
    const image = isRecord(candidate) ? candidate : null
    const base64 = image?.b64_json
    const contentType =
      typeof image?.media_type === "string" ? image.media_type : "image/png"
    const extension = GENERATED_IMAGE_EXTENSIONS.get(contentType)
    if (
      typeof base64 !== "string" ||
      !base64 ||
      base64.length > MAX_IMAGE_BASE64_LENGTH ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
      !extension
    )
      throw new Error("Provider returned an invalid image")
    const bytes = Uint8Array.from(Buffer.from(base64, "base64"))
    if (!bytes.length || bytes.byteLength > MAX_ATTACHMENT_BYTES)
      throw new Error("Provider returned an invalid image")
    return { bytes, contentType, extension }
  })
  if (!images.length) throw new Error("Provider returned no images")
  return { images }
}

export function parseOpenRouterImageResponse(value: unknown) {
  return parseOpenRouterImageResponses(value).images[0]
}

export async function generateOpenRouterImage(
  token: string,
  options: {
    capability?: ImageModelCapability
    config?: ImageGenerationConfig
    messages: ProviderMessage[]
    model: string
    prompt: string
    routingProvider?: string
    signal?: AbortSignal
  }
) {
  const latestUserMessage = options.messages.findLast(
    (message) => message.role === "user"
  )
  const inputReferences = (latestUserMessage?.attachments ?? []).flatMap(
    (attachment) =>
      classifyOpenRouterAttachment(attachment) === "image"
        ? [
            {
              type: "image_url" as const,
              image_url: { url: attachment.url },
            },
          ]
        : []
  )
  const provider = getImageProviderRouting(options.routingProvider)
  const providerInput =
    options.capability && options.config
      ? buildProviderImageInput(
          options.capability,
          validateImageGenerationConfig(options.capability, options.config)
        )
      : {}
  const response = await fetch(OPENROUTER_IMAGES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      prompt: options.prompt,
      ...providerInput,
      ...(inputReferences.length ? { input_references: inputReferences } : {}),
      ...(provider ? { provider } : {}),
    }),
    signal: timeoutSignal(IMAGE_REQUEST_TIMEOUT_MS, options.signal),
  })
  const result = await readBoundedJson(
    response,
    MAX_IMAGE_RESPONSE_JSON_BYTES,
    "OpenRouter returned an oversized or invalid image response"
  ).catch(() => null)
  if (!response.ok) throw new OpenRouterImageError(response.status)
  return parseOpenRouterImageResponses(result)
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
        (attachment) => classifyOpenRouterAttachment(attachment) === "pdf"
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

export async function inlineTextAttachments(
  messages: ProviderMessage[],
  read: (storageId: Id<"_storage">) => Promise<Blob | null>
) {
  let remaining = MAX_INLINE_TEXT_ATTACHMENT_CHARS
  const hydrated: ProviderMessage[] = new Array(messages.length)
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === "user"
  )
  const processingOrder = [
    ...(latestUserIndex < 0 ? [] : [latestUserIndex]),
    ...messages
      .map((_, index) => index)
      .filter((index) => index !== latestUserIndex),
  ]

  for (const index of processingOrder) {
    const message = messages[index]
    const attachments: NonNullable<ProviderMessage["attachments"]> = []
    const textFiles: string[] = []
    for (const attachment of message.attachments ?? []) {
      if (
        !attachment.storageId ||
        classifyOpenRouterAttachment(attachment) !== "text"
      ) {
        attachments.push(attachment)
        continue
      }

      const blob = await read(attachment.storageId)
      const text = blob
        ? decodeOpenRouterTextAttachment(await blob.arrayBuffer())
        : ""
      const excerpt = text.slice(0, remaining)
      remaining -= excerpt.length
      textFiles.push(
        `Referenced file ${JSON.stringify(attachment.name)}:\n--- BEGIN FILE ---\n${excerpt}${
          excerpt.length < text.length ? "\n[File truncated]" : ""
        }\n--- END FILE ---`
      )
    }
    hydrated[index] = {
      ...message,
      attachments,
      content: [message.content, ...textFiles].filter(Boolean).join("\n\n"),
    }
  }
  return hydrated
}

export function addGenerationContexts(
  messages: ProviderMessage[],
  memoryContext: string,
  projectSourceContext: string
) {
  if (!memoryContext && !projectSourceContext) return messages
  const latestUserIndex = messages.findLastIndex(
    (message) => message.role === "user"
  )
  const insertionIndex =
    latestUserIndex === -1 ? messages.length : latestUserIndex
  const referenceMessages: ProviderMessage[] = [
    ...(projectSourceContext
      ? [
          {
            content: `Reference context for the next user request:\n${projectSourceContext}`,
            role: "user" as const,
          },
        ]
      : []),
    ...(memoryContext
      ? [
          {
            content: `Reference context for the next user request:\n${memoryContext}`,
            role: "user" as const,
          },
        ]
      : []),
  ]
  return [
    ...messages.slice(0, insertionIndex),
    ...referenceMessages,
    ...messages.slice(insertionIndex),
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
            classifyOpenRouterAttachment(attachment) === "image"
              ? {
                  type: "image" as const,
                  image: new URL(attachment.url),
                  mediaType: resolveOpenRouterAttachmentMediaType(attachment),
                }
              : {
                  type: "file" as const,
                  data: new URL(attachment.url),
                  filename: attachment.name,
                  mediaType: resolveOpenRouterAttachmentMediaType(attachment),
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

async function createEmbeddings(token: string, input: string[]) {
  if (!input.length) return []
  try {
    return await createProviderEmbeddings(token, "openrouter", input)
  } catch {
    return null
  }
}

async function requestConversationTitle(
  token: string,
  args: {
    prompt: string
    provider: "openrouter" | "openai"
  }
) {
  const result =
    args.provider === "openrouter"
      ? await generateText({
          model: createUserOpenRouter(token)(
            OPENROUTER_TITLE_MODEL,
            getOpenRouterModelSettings(
              OPENROUTER_TITLE_MODEL,
              [],
              undefined,
              "auto"
            )
          ),
          instructions: CHAT_TITLE_INSTRUCTIONS,
          prompt: args.prompt,
          maxOutputTokens: 40,
          timeout: TITLE_REQUEST_TIMEOUT_MS,
        })
      : await generateText({
          model: createOpenAI({ apiKey: token }).responses(OPENAI_TITLE_MODEL),
          instructions: CHAT_TITLE_INSTRUCTIONS,
          prompt: args.prompt,
          maxOutputTokens: 40,
          providerOptions: { openai: getOpenAIOptions() },
          timeout: TITLE_REQUEST_TIMEOUT_MS,
        })
  return normalizeGeneratedChatTitle(result.text)
}

function projectIndexErrorCode(cause: unknown) {
  if (cause instanceof ProjectSourceExtractionError) return cause.code
  const status =
    cause instanceof ProviderEmbeddingError ? cause.statusCode : undefined
  if (status === 401) return "needs_reauthentication" as const
  if (status === 402) return "insufficient_credits" as const
  return "indexing_failed" as const
}

class ProjectSourceExtractionError extends Error {
  constructor(
    readonly code: "pdf_no_text" | "pdf_too_large" | "pdf_unreadable"
  ) {
    super(code)
  }
}

async function readPdfSourceForIndexing(blob: Blob) {
  if (blob.size > MAX_ATTACHMENT_BYTES)
    throw new ProjectSourceExtractionError("pdf_too_large")
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const sourceFingerprint = createHash("sha256").update(bytes).digest("hex")
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined
  try {
    pdf = await getDocumentProxy(bytes, {
      maxImageSize: MAX_PROJECT_PDF_IMAGE_PIXELS,
    })
    if (pdf.numPages > MAX_PROJECT_PDF_PAGES)
      throw new ProjectSourceExtractionError("pdf_too_large")

    let indexedText = ""
    let textWasTruncated = false
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        const pageText = content.items
          .flatMap((item) =>
            "str" in item ? `${item.str}${item.hasEOL ? "\n" : ""}` : []
          )
          .join("")
        const separator = indexedText && pageText ? "\n" : ""
        const remaining = MAX_PROJECT_SOURCE_TEXT_CHARS - indexedText.length
        const nextText = `${separator}${pageText}`
        if (nextText.length > remaining) textWasTruncated = true
        if (remaining > 0) indexedText += nextText.slice(0, remaining)
        if (textWasTruncated) break
      } finally {
        page.cleanup()
      }
    }
    if (!indexedText.trim())
      throw new ProjectSourceExtractionError("pdf_no_text")
    return { indexedText, sourceFingerprint, textWasTruncated }
  } catch (cause) {
    if (cause instanceof ProjectSourceExtractionError) throw cause
    throw new ProjectSourceExtractionError("pdf_unreadable")
  } finally {
    await pdf?.cleanup()
  }
}

export async function readProjectSourceForIndexing(
  blob: Blob,
  source?: { contentType: string; name?: string }
) {
  if (source && isPdfProjectSource(source.contentType, source.name))
    return await readPdfSourceForIndexing(blob)
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
        await readProjectSourceForIndexing(blob, {
          contentType: context.contentType,
          name: context.sourceName,
        })
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
): Promise<string> {
  if (!args.projectId || !args.query.trim()) return ""
  let connectionId: Id<"providerConnections"> | undefined
  try {
    const context: ProjectRetrievalContext | null = await ctx.runQuery(
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
    const chunks: ProjectSourceChunk[] = await ctx.runQuery(
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
      cause.statusCode === 401
    )
      await ctx.runMutation(
        internal.providerConnections.markProviderNeedsAuthentication,
        { connectionId }
      )
    return ""
  }
}

export const getDesktopCodexProjectContext = action({
  args: { conversationId: v.string() },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const request: DesktopCodexProjectSourceRequest | null = await ctx.runQuery(
      internal.conversations.getDesktopCodexProjectSourceRequest,
      {
        conversationId: args.conversationId,
      }
    )
    if (!request) return ""
    const retrievedContext = await retrieveRelevantProjectSources(ctx, request)
    if (retrievedContext) return retrievedContext
    const fallbackChunks: ProjectSourceChunk[] = await ctx.runQuery(
      internal.projectEmbeddings.getDesktopCodexProjectSourceFallback,
      {
        ownerId: request.ownerId,
        projectId: request.projectId,
      }
    )
    return buildProjectRetrievalContext(fallbackChunks)
  },
})

export const getDesktopCodexMemoryContext = action({
  args: { conversationId: v.string() },
  returns: desktopCodexMemoryContextValidator,
  handler: async (ctx, args): Promise<DesktopCodexMemoryContext> => {
    const request: {
      conversationId: Id<"conversations">
      currentMessageId: Id<"messages">
      ownerId: Id<"users">
    } | null = await ctx.runQuery(
      internal.conversations.getDesktopCodexMemoryContextRequest,
      { conversationId: args.conversationId }
    )
    if (!request) throw new Error("Codex conversation unavailable")
    return await ctx.runAction(
      internal.memoryActions.buildAgentContextWithRetrieval,
      {
        conversationId: request.conversationId,
        currentMessageId: request.currentMessageId,
        ownerId: request.ownerId,
      }
    )
  },
})

export const generateTitle = internalAction({
  args: { conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const context: ChatTitleGenerationContext | null = await ctx.runQuery(
        internal.conversations.getChatTitleGenerationContext,
        args
      )
      if (!context) return null
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        context.provider
      )
      const title = await requestConversationTitle(token, {
        prompt: context.initialQuestion,
        provider: context.provider,
      })
      if (title)
        await ctx.runMutation(internal.conversations.setGeneratedTitle, {
          conversationId: args.conversationId,
          title,
        })
    } catch {
      // A prompt-based fallback is already visible; title generation is optional.
    }
    return null
  },
})

export const generate = internalAction({
  args: {
    assistantMessageId: v.id("messages"),
    conversationId: v.id("conversations"),
    imageGenerationJobId: v.optional(v.id("imageGenerationJobs")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const abortController = new AbortController()
    let cancellationPollInFlight = false
    const responseWasStopped = async () =>
      args.imageGenerationJobId
        ? await ctx.runQuery(internal.imageGenerations.shouldCancelExecution, {
            assistantMessageId: args.assistantMessageId,
            generationJobId: args.imageGenerationJobId,
          })
        : await ctx.runQuery(internal.conversations.shouldCancelResponse, {
            assistantMessageId: args.assistantMessageId,
          })
    const throwIfStopped = async () => {
      if (!abortController.signal.aborted && (await responseWasStopped()))
        abortController.abort(new ResponseStoppedError())
      if (abortController.signal.aborted) throw new ResponseStoppedError()
    }
    const cancellationPoll = setInterval(() => {
      if (cancellationPollInFlight || abortController.signal.aborted) return
      cancellationPollInFlight = true
      void responseWasStopped()
        .then((stopped) => {
          if (stopped && !abortController.signal.aborted)
            abortController.abort(new ResponseStoppedError())
        })
        .finally(() => {
          cancellationPollInFlight = false
        })
    }, 1_000)
    let connectionId: Id<"providerConnections"> | undefined
    let content = ""
    let provider: "openrouter" | "openai" | "fal" | undefined
    let reasoning = ""
    let terminalRuns: StoredTerminalRun[] = []
    let uiPayload: string | undefined
    let errorCode: "insufficient_credits" | undefined
    let imageExecution:
      | {
          capabilityRevision: string
          config: ImageGenerationConfig
          endpoint?: string
          generationSetId: Id<"imageGenerationSets">
          generationJobId: Id<"imageGenerationJobs">
        }
      | undefined
    const stagedImageStorageIds: Id<"_storage">[] = []
    try {
      if (args.imageGenerationJobId) {
        const claimed = await ctx.runMutation(
          internal.imageGenerations.claimExecution,
          {
            assistantMessageId: args.assistantMessageId,
            generationJobId: args.imageGenerationJobId,
          }
        )
        if (!claimed) return null
        imageExecution = claimed
      }
      await throwIfStopped()
      const context = await ctx.runQuery(
        internal.conversations.getOpenRouterResponseContext,
        {
          assistantMessageId: args.assistantMessageId,
          conversationId: args.conversationId,
        }
      )
      connectionId = context.connectionId
      provider = context.provider
      if (imageExecution && context.outputMode !== "image")
        throw new Error("Image generation context is unavailable")
      const token = await decryptProviderToken(
        context.ciphertext,
        context.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        context.provider
      )
      if (context.outputMode === "image") {
        const execution = imageExecution
        const messages = context.messages
        const capability = execution
          ? context.provider === "fal"
            ? getStaticImageModelCapability("fal", context.model)
            : await loadOpenRouterImageCapability(
                token,
                context.model,
                context.routingProvider
              )
          : null
        if (
          execution &&
          (!capability || capability.revision !== execution.capabilityRevision)
        )
          throw new Error("Image model capability changed before generation")
        let generated: {
          requestId?: string
          images: Array<{
            bytes: Uint8Array
            contentType: string
            extension: string
            width?: number
            height?: number
            seed?: number
          }>
        }
        if (context.provider === "openrouter") {
          generated = await generateOpenRouterImage(token, {
            ...(capability && execution
              ? { capability, config: execution.config }
              : {}),
            messages,
            model: context.model,
            prompt: context.lastUserMessage,
            routingProvider: context.routingProvider,
            signal: abortController.signal,
          })
        } else if (context.provider === "fal") {
          const referenceUrls = (
            messages.findLast((message) => message.role === "user")
              ?.attachments ?? []
          ).flatMap((attachment) =>
            classifyOpenRouterAttachment(attachment) === "image"
              ? [attachment.url]
              : []
          )
          generated = await generateFalImage(
            token,
            {
              ...(execution ? { config: execution.config } : {}),
              model: context.model,
              prompt: context.lastUserMessage,
              referenceUrls,
            },
            { signal: abortController.signal }
          )
        } else {
          throw new Error("Image generation requires OpenRouter or Fal")
        }
        const requestedMaximum =
          execution && capability
            ? getImageOutputRange(capability, execution.config).maximum
            : generated.images.length
        generated.images = generated.images.slice(0, requestedMaximum)
        await throwIfStopped()
        const storedOutputs: Array<{
          storageId: Id<"_storage">
          name: string
          contentType: string
          size: number
          width?: number
          height?: number
          seed?: number
        }> = []
        try {
          for (const [index, image] of generated.images.entries()) {
            const storageId = await ctx.storage.store(
              new Blob([Uint8Array.from(image.bytes).buffer], {
                type: image.contentType,
              })
            )
            storedOutputs.push({
              storageId,
              name: `generated-image-${index + 1}.${image.extension}`,
              contentType: image.contentType,
              size: image.bytes.byteLength,
              ...(image.width === undefined ? {} : { width: image.width }),
              ...(image.height === undefined ? {} : { height: image.height }),
              ...(image.seed === undefined ? {} : { seed: image.seed }),
            })
            stagedImageStorageIds.push(storageId)
            if (execution) {
              const staged = await ctx.runMutation(
                internal.imageGenerations.stageOutput,
                {
                  generationSetId: execution.generationSetId,
                  generationJobId: execution.generationJobId,
                  ordinal: index,
                  output: storedOutputs.at(-1)!,
                }
              )
              if (!staged) throw new ResponseStoppedError()
            }
          }
          await throwIfStopped()
          if (execution) {
            const completed = await ctx.runMutation(
              internal.imageGenerations.completeGeneration,
              {
                generationSetId: execution.generationSetId,
                generationJobId: execution.generationJobId,
                ...(generated.requestId
                  ? { providerRequestId: generated.requestId }
                  : {}),
              }
            )
            if (!completed) throw new ResponseStoppedError()
          } else {
            await ctx.runMutation(
              internal.conversations.finishOpenRouterResponse,
              {
                assistantMessageId: args.assistantMessageId,
                attachments: storedOutputs.map(
                  ({ storageId, name, contentType, size }) => ({
                    storageId,
                    name,
                    contentType,
                    size,
                  })
                ),
                content: "",
                failed: false,
              }
            )
          }
        } catch (cause) {
          if (!execution || cause instanceof ResponseStoppedError)
            await Promise.allSettled(
              storedOutputs.map(
                async ({ storageId }) => await ctx.storage.delete(storageId)
              )
            )
          throw cause
        }
        return null
      }
      const agentMemoryContext = await ctx.runAction(
        internal.memoryActions.buildAgentContextWithRetrieval,
        {
          conversationId: args.conversationId,
          currentMessageId: context.lastUserMessageId,
          ownerId: context.ownerId,
        }
      )
      await throwIfStopped()
      const projectSourceContext = await retrieveRelevantProjectSources(ctx, {
        ownerId: context.ownerId,
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
        agentMemoryContext.referenceText,
        projectSourceContext
      )
      const prompt = toModelPrompt(messages)
      const supportsTools =
        context.provider !== "openrouter" ||
        (await loadOpenRouterModelSupportsTools(
          token,
          context.model,
          abortController.signal
        ))
      const terminalSandbox = supportsTools
        ? createTerminalSandboxSession({
            conversationId: args.conversationId,
            ...(context.projectId ? { projectId: context.projectId } : {}),
            workerToken: env.TERMINAL_WORKER_TOKEN,
            workerUrl: env.TERMINAL_WORKER_URL,
          })
        : null
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
              const openrouter = createUserOpenRouter(token)
              const tools = selectOpenRouterTools(supportsTools, {
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
              })
              return streamText({
                abortSignal: abortController.signal,
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
                ...(tools ? { tools } : {}),
                ...terminalOptions,
                timeout: 120_000,
              })
            })()
          : (() => {
              const openai = createOpenAI({ apiKey: token })
              return streamText({
                abortSignal: abortController.signal,
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

      await throwIfStopped()
      await ctx.runMutation(internal.conversations.updateOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
      })
      let completed = false
      let lastFlushAt = 0
      const terminalStartedAt = new Map<string, number>()
      for await (const event of result.stream) {
        await throwIfStopped()
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
            await throwIfStopped()
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
      await throwIfStopped()
      content = content.trim()
      if (!completed || (!content && !uiPayload && !terminalRuns.length))
        throw new Error("Provider response incomplete")

      let contextTokens: number | undefined
      let providerUsage: ReturnType<typeof aggregateOpenRouterUsage>
      try {
        const totalTokens = (await result.usage).totalTokens
        if (
          typeof totalTokens === "number" &&
          Number.isSafeInteger(totalTokens) &&
          totalTokens >= 0
        )
          contextTokens = totalTokens
      } catch {
        // Usage metadata is optional and must not discard a completed response.
      }
      if (context.provider === "openrouter") {
        try {
          providerUsage = aggregateOpenRouterUsage(await result.steps)
        } catch {
          // Provider billing metadata is optional and independent of token usage.
        }
      }

      await throwIfStopped()
      await ctx.runMutation(internal.conversations.finishOpenRouterResponse, {
        assistantMessageId: args.assistantMessageId,
        content,
        ...(contextTokens === undefined ? {} : { contextTokens }),
        ...(providerUsage ? { providerUsage } : {}),
        failed: false,
        ...(reasoning.trim() ? { reasoningSteps: [reasoning.trim()] } : {}),
        ...(terminalRuns.length ? { terminalRuns } : {}),
        ...(uiPayload ? { uiPayload } : {}),
      })
      try {
        await ctx.runMutation(internal.memoryContext.recordResponseReferences, {
          conversationId: args.conversationId,
          memoryItemIds: agentMemoryContext.selectedMemoryItemIds,
          ownerId: context.ownerId,
          responseMessageId: args.assistantMessageId,
          summaryIds: agentMemoryContext.historySummaryIds,
        })
      } catch {
        // Source attribution must never change a completed assistant response.
      }
      return null
    } catch (cause) {
      if (
        cause instanceof ResponseStoppedError ||
        abortController.signal.aborted ||
        (await responseWasStopped())
      )
        return null
      const failure = classifyProviderFailure(cause, provider)
      const status = failure.status
      if (connectionId && failure.needsAuthentication) {
        await ctx.runMutation(
          internal.providerConnections.markProviderNeedsAuthentication,
          { connectionId }
        )
      }
      if (failure.code === "insufficient_credits")
        errorCode = "insufficient_credits"
      console.error("Provider request failed", {
        provider,
        code: failure.code,
        ...(failure.errorType ? { errorType: failure.errorType } : {}),
        ...(status === undefined ? {} : { status }),
      })
      if (imageExecution) {
        await ctx.runMutation(internal.imageGenerations.failGeneration, {
          generationSetId: imageExecution.generationSetId,
          generationJobId: imageExecution.generationJobId,
          errorCode:
            failure.code === "insufficient_credits"
              ? "insufficient_credits"
              : failure.code === "rate_limited"
                ? "rate_limited"
                : failure.code === "provider_unavailable"
                  ? "provider_unavailable"
                  : "generation_failed",
          errorMessage:
            failure.code === "insufficient_credits"
              ? "The connected provider account has insufficient credit."
              : failure.code === "rate_limited"
                ? "The provider rate limit was reached."
                : "The provider could not complete this image generation.",
        })
        await Promise.allSettled(
          stagedImageStorageIds.map(
            async (storageId) => await ctx.storage.delete(storageId)
          )
        )
        return null
      }
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
        content: failure.safeMessage,
        ...(errorCode ? { errorCode } : {}),
        failed: true,
        ...(reasoning.trim() ? { reasoningSteps: [reasoning.trim()] } : {}),
        ...(terminalRuns.length ? { terminalRuns } : {}),
      })
      throw new Error(failure.safeMessage)
    } finally {
      clearInterval(cancellationPoll)
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
