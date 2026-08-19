import { v } from "convex/values"

import { internal } from "./_generated/api"
import { action, env } from "./_generated/server"
import { FalApiError, loadFalImageModels } from "./fal"
import { decryptProviderToken, encryptProviderToken } from "./providerCrypto"
import {
  RENDER_UI_TOOL_NAME,
  renderUiToolDescription,
  renderUiToolJsonSchema,
} from "../shared/generative-ui"

const OPENROUTER_TOKEN_URL = "https://openrouter.ai/api/v1/auth/keys"
const OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"
const OPENROUTER_MODELS_URL =
  "https://openrouter.ai/api/v1/models?output_modalities=all&sort=newest"
const OPENROUTER_MODEL_ENDPOINTS_URL = "https://openrouter.ai/api/v1/models"
const OPENAI_MODELS_URL = "https://api.openai.com/v1/models"
const OPENAI_REALTIME_URL = "https://api.openai.com/v1/realtime/calls"
const MAX_SDP_BYTES = 64 * 1024
const LONG_CONTEXT_WINDOW = 1_050_000
const COMPACT_CONTEXT_WINDOW = 400_000
const REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "cedar",
  "coral",
  "echo",
  "marin",
  "sage",
  "shimmer",
  "verse",
])
// ponytail: bounded above today's catalog size; paginate if OpenRouter exceeds 1,000 models.
const MAX_MODELS = 1_000
const realtimeSessionValidator = v.object({
  answer: v.string(),
  memoryReferenceText: v.string(),
})

export function isValidSdpOffer(offer: string) {
  return (
    offer.startsWith("v=0") &&
    new TextEncoder().encode(offer).byteLength <= MAX_SDP_BYTES
  )
}

export function resolveRealtimeVoice(voice: string) {
  return REALTIME_VOICES.has(voice) ? voice : "marin"
}

async function safetyIdentifier(userId: string) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(userId)
  )
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

export const OPENAI_MODELS = [
  {
    provider: "openai",
    value: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "Frontier model for complex professional work",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["max", "xhigh", "high", "medium", "low", "none"],
  },
  {
    provider: "openai",
    value: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "Balances intelligence and cost",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["max", "xhigh", "high", "medium", "low", "none"],
  },
  {
    provider: "openai",
    value: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "Optimized for cost-sensitive workloads",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["max", "xhigh", "high", "medium", "low", "none"],
  },
  {
    provider: "openai",
    value: "gpt-5.5",
    label: "GPT-5.5",
    description: "Advanced coding and professional work",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["xhigh", "high", "medium", "low", "none"],
  },
  {
    provider: "openai",
    value: "gpt-5.5-pro",
    label: "GPT-5.5 Pro",
    description: "Higher-compute GPT-5.5",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
  },
  {
    provider: "openai",
    value: "gpt-5.4",
    label: "GPT-5.4",
    description: "Coding and professional work",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["xhigh", "high", "medium", "low", "none"],
  },
  {
    provider: "openai",
    value: "gpt-5.4-pro",
    label: "GPT-5.4 Pro",
    description: "Higher-compute GPT-5.4",
    contextLength: LONG_CONTEXT_WINDOW,
    outputMode: "text",
  },
  {
    provider: "openai",
    value: "gpt-5.4-mini",
    label: "GPT-5.4 mini",
    description: "Fast, efficient GPT-5.4",
    contextLength: COMPACT_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["xhigh", "high", "medium", "low", "none"],
  },
  {
    provider: "openai",
    value: "gpt-5.4-nano",
    label: "GPT-5.4 nano",
    description: "Low-cost, high-volume GPT-5.4",
    contextLength: COMPACT_CONTEXT_WINDOW,
    outputMode: "text",
    reasoningEfforts: ["xhigh", "high", "medium", "low", "none"],
  },
] satisfies CatalogModel[]

type CatalogModel = {
  provider: string
  value: string
  label: string
  description?: string
  contextLength?: number
  inputModalities?: string[]
  outputMode: "image" | "text"
  reasoningEfforts?: ReasoningEffort[]
  defaultReasoningEffort?: ReasoningEffort
}

type ModelEndpoint = {
  providerName: string
  providerTag: string
  promptPrice: number
  completionPrice: number
  imagePrice?: number
  cacheReadPrice?: number
  cacheWritePrice?: number
  contextLength?: number
  quantization?: string
  uptime?: number
  throughput?: number
}

const REASONING_EFFORTS = [
  "max",
  "xhigh",
  "high",
  "medium",
  "low",
  "minimal",
  "none",
] as const

type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

const reasoningEffortValidator = v.union(
  v.literal("max"),
  v.literal("xhigh"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("minimal"),
  v.literal("none")
)

const modelValidator = v.object({
  provider: v.string(),
  value: v.string(),
  label: v.string(),
  description: v.optional(v.string()),
  contextLength: v.optional(v.number()),
  inputModalities: v.optional(v.array(v.string())),
  outputMode: v.union(v.literal("image"), v.literal("text")),
  reasoningEfforts: v.optional(v.array(reasoningEffortValidator)),
  defaultReasoningEffort: v.optional(reasoningEffortValidator),
})

const modelEndpointValidator = v.object({
  providerName: v.string(),
  providerTag: v.string(),
  promptPrice: v.number(),
  completionPrice: v.number(),
  imagePrice: v.optional(v.number()),
  cacheReadPrice: v.optional(v.number()),
  cacheWritePrice: v.optional(v.number()),
  contextLength: v.optional(v.number()),
  quantization: v.optional(v.string()),
  uptime: v.optional(v.number()),
  throughput: v.optional(v.number()),
})

const creditStatusValidator = v.object({
  isFreeTier: v.boolean(),
  limit: v.union(v.number(), v.null()),
  remaining: v.union(v.number(), v.null()),
  usage: v.number(),
})

type CreditStatus = {
  isFreeTier: boolean
  limit: number | null
  remaining: number | null
  usage: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function readPrice(value: unknown) {
  const price = typeof value === "string" ? Number(value) : value
  return isFiniteNumber(price) && price >= 0
    ? Number((price * 1_000_000).toPrecision(12))
    : undefined
}

function readImagePrice(value: unknown) {
  const price = typeof value === "string" ? Number(value) : value
  return isFiniteNumber(price) && price >= 0
    ? Number((price * 4_096).toPrecision(12))
    : undefined
}

type OpenRouterEndpoint = Record<string, unknown> & {
  status: number
  provider_name: string
  tag: string
  pricing: Record<string, unknown>
}

type OpenRouterEndpointCatalog = {
  data: {
    endpoints: OpenRouterEndpoint[]
  }
}

function isValidPriceInput(value: unknown): boolean {
  const price = typeof value === "string" ? Number(value) : value
  return (
    (typeof value !== "string" || value.trim().length > 0) &&
    isFiniteNumber(price) &&
    price >= 0
  )
}

function isOpenRouterEndpoint(value: unknown): value is OpenRouterEndpoint {
  if (!isRecord(value) || !isRecord(value.pricing)) return false

  return (
    isFiniteNumber(value.status) &&
    typeof value.provider_name === "string" &&
    value.provider_name.length > 0 &&
    value.provider_name.length <= 100 &&
    typeof value.tag === "string" &&
    value.tag.length > 0 &&
    value.tag.length <= 100 &&
    isValidPriceInput(value.pricing.prompt) &&
    isValidPriceInput(value.pricing.completion)
  )
}

export function isOpenRouterEndpointCatalog(
  value: unknown
): value is OpenRouterEndpointCatalog {
  return (
    isRecord(value) &&
    isRecord(value.data) &&
    Array.isArray(value.data.endpoints) &&
    value.data.endpoints.every(isOpenRouterEndpoint)
  )
}

export function parseOpenRouterEndpoints(value: unknown): ModelEndpoint[] {
  if (!isOpenRouterEndpointCatalog(value)) return []

  return value.data.endpoints
    .flatMap((endpoint) => {
      if (endpoint.status !== 0) return []
      const promptPrice = readPrice(endpoint.pricing.prompt)
      const completionPrice = readPrice(endpoint.pricing.completion)
      if (promptPrice === undefined || completionPrice === undefined) return []

      const cacheReadPrice = readPrice(endpoint.pricing.input_cache_read)
      const cacheWritePrice = readPrice(endpoint.pricing.input_cache_write)
      const imagePrice = readImagePrice(endpoint.pricing.image_output)
      const throughput = isRecord(endpoint.throughput_last_30m)
        ? endpoint.throughput_last_30m.p50
        : endpoint.throughput_last_30m
      return [
        {
          providerName: endpoint.provider_name,
          providerTag: endpoint.tag,
          promptPrice,
          completionPrice,
          ...(imagePrice === undefined ? {} : { imagePrice }),
          ...(cacheReadPrice === undefined ? {} : { cacheReadPrice }),
          ...(cacheWritePrice === undefined ? {} : { cacheWritePrice }),
          ...(isFiniteNumber(endpoint.context_length) &&
          endpoint.context_length > 0
            ? { contextLength: endpoint.context_length }
            : {}),
          ...(typeof endpoint.quantization === "string" &&
          endpoint.quantization.length <= 20
            ? { quantization: endpoint.quantization }
            : {}),
          ...(isFiniteNumber(endpoint.uptime_last_1d)
            ? { uptime: endpoint.uptime_last_1d }
            : {}),
          ...(isFiniteNumber(throughput) ? { throughput } : {}),
        },
      ]
    })
    .sort(
      (left, right) =>
        (left.imagePrice ?? left.promptPrice + left.completionPrice) -
          (right.imagePrice ?? right.promptPrice + right.completionPrice) ||
        left.providerName.localeCompare(right.providerName)
    )
}

export function isValidOpenRouterModelId(model: string) {
  const parts = model.split("/")
  return (
    parts.length === 2 &&
    parts.every((part) => part.length > 0 && part.length <= 100) &&
    /^~?[A-Za-z0-9._:-]+$/.test(parts[0]) &&
    /^[A-Za-z0-9._:-]+$/.test(parts[1])
  )
}

export function getOpenRouterModelEndpointsUrl(model: string) {
  if (!isValidOpenRouterModelId(model)) {
    throw new Error("Model is unavailable")
  }
  const parts = model.split("/")
  return `${OPENROUTER_MODEL_ENDPOINTS_URL}/${parts.map(encodeURIComponent).join("/")}/endpoints`
}

export function parseOpenRouterCreditStatus(
  value: unknown
): CreditStatus | null {
  if (!isRecord(value) || !isRecord(value.data)) return null

  const { is_free_tier, limit, limit_remaining, usage } = value.data
  if (
    typeof is_free_tier !== "boolean" ||
    (limit !== null && !isFiniteNumber(limit)) ||
    (limit_remaining !== null && !isFiniteNumber(limit_remaining)) ||
    !isFiniteNumber(usage)
  ) {
    return null
  }

  return {
    isFreeTier: is_free_tier,
    limit,
    remaining: limit_remaining,
    usage,
  }
}

function readModalities(value: unknown) {
  return Array.isArray(value)
    ? value.filter(
        (modality): modality is string =>
          typeof modality === "string" && modality.length <= 32
      )
    : []
}

function isReasoningEffort(value: unknown): value is ReasoningEffort {
  return REASONING_EFFORTS.some((effort) => effort === value)
}

function readReasoningOptions(value: unknown) {
  if (!isRecord(value) || !("supported_efforts" in value)) return {}

  const supported =
    value.supported_efforts === null
      ? [...REASONING_EFFORTS]
      : Array.isArray(value.supported_efforts)
        ? [...new Set(value.supported_efforts.filter(isReasoningEffort))]
        : []
  const reasoningEfforts =
    value.mandatory === true
      ? supported.filter((effort) => effort !== "none")
      : supported

  if (reasoningEfforts.length === 0) return {}

  const declaredDefault = value.default_effort
  const defaultReasoningEffort =
    isReasoningEffort(declaredDefault) &&
    reasoningEfforts.includes(declaredDefault)
      ? declaredDefault
      : reasoningEfforts.includes("medium")
        ? "medium"
        : reasoningEfforts[0]

  return { defaultReasoningEffort, reasoningEfforts }
}

function formatContextLength(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null
  }
  if (value >= 1_000_000) {
    return `${Number((value / 1_000_000).toFixed(1))}M context`
  }
  return `${Math.round(value / 1_000)}K context`
}

function describeCapabilities(
  inputModalities: string[],
  outputModalities: string[],
  contextLength: string | null
) {
  const capabilities: string[] = []

  if (outputModalities.includes("image")) capabilities.push("Image generation")
  if (outputModalities.includes("video")) capabilities.push("Video generation")
  if (outputModalities.includes("audio")) capabilities.push("Audio generation")
  if (outputModalities.includes("transcription"))
    capabilities.push("Transcription")
  if (outputModalities.includes("embeddings")) capabilities.push("Embeddings")
  if (outputModalities.includes("text")) capabilities.push("Chat")
  if (outputModalities.includes("text") && inputModalities.includes("image")) {
    capabilities.push("Vision")
  }
  if (outputModalities.includes("text") && inputModalities.includes("file")) {
    capabilities.push("Files")
  }
  if (capabilities.length === 0) capabilities.push("Specialized")
  if (contextLength) capabilities.push(contextLength)

  return capabilities.join(" · ")
}

export function parseOpenRouterModels(models: unknown[]): CatalogModel[] {
  return models
    .filter(isRecord)
    .flatMap((model) => {
      if (
        typeof model.id !== "string" ||
        typeof model.name !== "string" ||
        !isValidOpenRouterModelId(model.id) ||
        model.name.length > 200
      ) {
        return []
      }

      const provider = model.id.split("/", 1)[0]
      if (!provider) return []

      const architecture = isRecord(model.architecture)
        ? model.architecture
        : {}
      const inputModalities = readModalities(architecture.input_modalities)
      const outputModalities = readModalities(architecture.output_modalities)
      const contextLength =
        isFiniteNumber(model.context_length) && model.context_length > 0
          ? model.context_length
          : undefined
      const contextLengthLabel = formatContextLength(contextLength)
      const separatorIndex = model.name.indexOf(": ")
      const label =
        separatorIndex > 0 && separatorIndex < 40
          ? model.name.slice(separatorIndex + 2)
          : model.name
      const reasoningOptions = readReasoningOptions(model.reasoning)
      const outputMode: CatalogModel["outputMode"] =
        outputModalities.includes("image") && !outputModalities.includes("text")
          ? "image"
          : "text"

      return [
        {
          provider,
          value: model.id,
          label,
          outputMode,
          inputModalities,
          ...(contextLength === undefined ? {} : { contextLength }),
          description: describeCapabilities(
            inputModalities,
            outputModalities,
            contextLengthLabel
          ),
          ...reasoningOptions,
        },
      ]
    })
    .slice(0, MAX_MODELS)
}

export function parseOpenAIModels(models: unknown[]): CatalogModel[] {
  const availableIds = new Set(
    models
      .filter(isRecord)
      .map((model) => model.id)
      .filter((id): id is string => typeof id === "string")
  )

  return OPENAI_MODELS.filter((model) => availableIds.has(model.value))
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export const completeOpenRouter = action({
  args: {
    code: v.string(),
    codeVerifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new Error("Not authenticated")
    if (!args.code || args.code.length > 2048) {
      throw new Error("Invalid authorization code")
    }
    if (
      args.codeVerifier.length < 43 ||
      args.codeVerifier.length > 128 ||
      !/^[A-Za-z0-9._~-]+$/.test(args.codeVerifier)
    ) {
      throw new Error("Invalid PKCE verifier")
    }

    const response = await fetch(OPENROUTER_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: args.code,
        code_verifier: args.codeVerifier,
        code_challenge_method: "S256",
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const result = await readJson(response)
    const key = isRecord(result) ? result.key : null

    if (
      !response.ok ||
      typeof key !== "string" ||
      key.length < 16 ||
      key.length > 2048
    ) {
      throw new Error("OpenRouter authorization failed")
    }

    const encrypted = await encryptProviderToken(
      key,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY
    )
    await ctx.runMutation(
      internal.providerConnections.completeOpenRouterOAuth,
      encrypted
    )
    return null
  },
})

export const connectOpenAI = action({
  args: { apiKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new Error("Not authenticated")
    const key = args.apiKey.trim()
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key) || key.length > 512)
      throw new Error("Enter a valid OpenAI API key")
    const encrypted = await encryptProviderToken(
      key,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY,
      "openai"
    )
    await ctx.runMutation(internal.providerConnections.completeApiKey, {
      ...encrypted,
      provider: "openai",
    })
    return null
  },
})

export const connectFal = action({
  args: { apiKey: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!(await ctx.auth.getUserIdentity()))
      throw new Error("Not authenticated")
    const key = args.apiKey.trim()
    if (
      key.length < 16 ||
      key.length > 2048 ||
      /\s/.test(key) ||
      [...key].some((character) => {
        const code = character.charCodeAt(0)
        return code < 32 || code === 127
      })
    )
      throw new Error("Enter a valid Fal API key")

    try {
      await loadFalImageModels(key)
    } catch (cause) {
      if (
        cause instanceof FalApiError &&
        (cause.statusCode === 401 || cause.statusCode === 403)
      )
        throw new Error("Fal rejected this API key")
      throw new Error("Fal could not verify this API key")
    }

    const encrypted = await encryptProviderToken(
      key,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY,
      "fal"
    )
    await ctx.runMutation(internal.providerConnections.completeApiKey, {
      ...encrypted,
      provider: "fal",
    })
    return null
  },
})

export const createRealtimeSession = action({
  args: {
    conversationId: v.optional(v.string()),
    offer: v.string(),
    voice: v.string(),
  },
  returns: realtimeSessionValidator,
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")
    if (!isValidSdpOffer(args.offer)) throw new Error("Invalid SDP offer")

    const credential = await ctx.runQuery(
      internal.providerConnections.getProviderCredential,
      { provider: "openai" }
    )
    if (!credential) throw new Error("Connect OpenAI before starting voice")

    const token = await decryptProviderToken(
      credential.ciphertext,
      credential.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY,
      "openai"
    )
    const form = new FormData()
    form.set("sdp", args.offer)
    form.set(
      "session",
      JSON.stringify({
        type: "realtime",
        model: "gpt-realtime-2.1",
        output_modalities: ["audio"],
        instructions:
          "Be concise, conversational, and helpful. Speak naturally. Ask one clarifying question when the request is ambiguous.",
        tools: [
          {
            type: "function",
            name: RENDER_UI_TOOL_NAME,
            description: renderUiToolDescription,
            parameters: renderUiToolJsonSchema,
          },
        ],
        audio: {
          input: {
            transcription: {
              model: "gpt-realtime-whisper",
              language: "en",
            },
            turn_detection: { type: "semantic_vad" },
          },
          output: { voice: resolveRealtimeVoice(args.voice) },
        },
      })
    )

    const response = await fetch(OPENAI_REALTIME_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "OpenAI-Safety-Identifier": await safetyIdentifier(
          identity.tokenIdentifier
        ),
      },
      body: form,
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      console.error("OpenAI Realtime session failed", {
        requestId: response.headers.get("x-request-id"),
        status: response.status,
      })
      throw new Error(
        response.status === 401 || response.status === 403
          ? "OpenAI rejected the saved API key. Update it in Providers."
          : "Realtime session could not be created"
      )
    }

    let memoryReferenceText = ""
    if (args.conversationId) {
      try {
        const request = await ctx.runQuery(
          internal.conversations.getRealtimeMemoryContextRequest,
          { conversationId: args.conversationId }
        )
        if (request) {
          const memoryContext = await ctx.runAction(
            internal.memoryActions.buildAgentContextWithRetrieval,
            {
              conversationId: request.conversationId,
              ownerId: request.ownerId,
              ...(request.currentMessageId
                ? { currentMessageId: request.currentMessageId }
                : {}),
            }
          )
          memoryReferenceText = memoryContext.referenceText
        }
      } catch {
        // Realtime voice remains available when optional memory is unavailable.
      }
    }

    return {
      answer: await response.text(),
      memoryReferenceText,
    }
  },
})

export const listModels = action({
  args: {
    provider: v.union(
      v.literal("openrouter"),
      v.literal("openai"),
      v.literal("fal")
    ),
  },
  returns: v.array(modelValidator),
  handler: async (ctx, args) => {
    if (args.provider === "fal") {
      const credential = await ctx.runQuery(
        internal.providerConnections.getProviderCredential,
        { provider: "fal" }
      )
      if (!credential) throw new Error("Provider not connected")
      const token = await decryptProviderToken(
        credential.ciphertext,
        credential.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        "fal"
      )
      try {
        return await loadFalImageModels(token)
      } catch (cause) {
        if (
          cause instanceof FalApiError &&
          (cause.statusCode === 401 || cause.statusCode === 403)
        ) {
          await ctx.runMutation(
            internal.providerConnections.markProviderNeedsAuthentication,
            { connectionId: credential.connectionId }
          )
          throw new Error("Provider authorization expired")
        }
        throw cause
      }
    }
    if (args.provider === "openai") {
      const credential = await ctx.runQuery(
        internal.providerConnections.getProviderCredential,
        { provider: "openai" }
      )
      if (!credential) throw new Error("Provider not connected")

      const token = await decryptProviderToken(
        credential.ciphertext,
        credential.iv,
        env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        "openai"
      )
      const response = await fetch(OPENAI_MODELS_URL, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      })
      if (!response.ok) throw new Error("Could not load provider models")

      const result = await readJson(response)
      if (!isRecord(result) || !Array.isArray(result.data)) {
        throw new Error("Provider returned an invalid model catalog")
      }

      return parseOpenAIModels(result.data)
    }
    const credential = await ctx.runQuery(
      internal.providerConnections.getOpenRouterCredential,
      {}
    )
    if (!credential) throw new Error("Provider not connected")

    const token = await decryptProviderToken(
      credential.ciphertext,
      credential.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY
    )
    const response = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (response.status === 401 || response.status === 403) {
      await ctx.runMutation(
        internal.providerConnections.markOpenRouterNeedsAuthentication,
        {}
      )
      throw new Error("Provider authorization expired")
    }
    if (!response.ok) throw new Error("Could not load provider models")

    const result = await readJson(response)
    if (!isRecord(result) || !Array.isArray(result.data)) {
      throw new Error("Provider returned an invalid model catalog")
    }

    return parseOpenRouterModels(result.data)
  },
})

export const listModelEndpoints = action({
  args: { model: v.string() },
  returns: v.array(modelEndpointValidator),
  handler: async (ctx, args) => {
    if (!isValidOpenRouterModelId(args.model)) return []

    const credential = await ctx.runQuery(
      internal.providerConnections.getOpenRouterCredential,
      {}
    )
    if (!credential) throw new Error("Provider not connected")

    const token = await decryptProviderToken(
      credential.ciphertext,
      credential.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY
    )
    const response = await fetch(getOpenRouterModelEndpointsUrl(args.model), {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.status === 401 || response.status === 403) {
      await ctx.runMutation(
        internal.providerConnections.markOpenRouterNeedsAuthentication,
        {}
      )
      throw new Error("Provider authorization expired")
    }
    if (!response.ok) throw new Error("Could not load model providers")

    const endpointCatalog = await readJson(response)
    if (!isOpenRouterEndpointCatalog(endpointCatalog)) {
      throw new Error("Provider returned an invalid endpoint catalog")
    }
    return parseOpenRouterEndpoints(endpointCatalog)
  },
})

export const getCreditStatus = action({
  args: { provider: v.literal("openrouter") },
  returns: creditStatusValidator,
  handler: async (ctx) => {
    const credential = await ctx.runQuery(
      internal.providerConnections.getOpenRouterCredential,
      {}
    )
    if (!credential) throw new Error("Provider not connected")

    const token = await decryptProviderToken(
      credential.ciphertext,
      credential.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY
    )
    const response = await fetch(OPENROUTER_KEY_URL, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    })

    if (response.status === 401 || response.status === 403) {
      await ctx.runMutation(
        internal.providerConnections.markOpenRouterNeedsAuthentication,
        {}
      )
      throw new Error("Provider authorization expired")
    }
    if (!response.ok) throw new Error("Could not load provider credit status")

    const creditStatus = parseOpenRouterCreditStatus(await readJson(response))
    if (!creditStatus)
      throw new Error("Provider returned invalid credit status")
    return creditStatus
  },
})
