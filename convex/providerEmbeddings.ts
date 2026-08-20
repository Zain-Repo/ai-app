"use node"

import { createOpenAI } from "@ai-sdk/openai"
import type { OpenRouterEmbeddingSettings } from "@openrouter/ai-sdk-provider"
import { APICallError, embedMany } from "ai"

import { createUserOpenRouter } from "../shared/openrouter-provider"
import {
  getMemoryProcessingPolicy,
  toFixedDimensionEmbedding,
} from "./memoryPolicy"
import {
  getProjectEmbeddingModel,
  OPENAI_EMBEDDING_MODEL,
  OPENROUTER_EMBEDDING_MODEL,
  PROJECT_EMBEDDING_DIMENSIONS,
} from "./projectEmbeddingPolicy"

export const EMBEDDING_DIMENSIONS = PROJECT_EMBEDDING_DIMENSIONS
export { OPENAI_EMBEDDING_MODEL, OPENROUTER_EMBEDDING_MODEL }
const EMBEDDING_REQUEST_TIMEOUT_MS = 30_000

export type EmbeddingProvider = "openrouter" | "openai"

type EmbeddingRequestOptions = {
  dimensions?: number
  model?: string
  reduceNativeDimensions?: boolean
}

const PRIVATE_OPENROUTER_ROUTING = {
  data_collection: "deny",
  require_parameters: true,
  zdr: true,
} as const

export class ProviderEmbeddingError extends Error {
  constructor(readonly statusCode?: number) {
    super("Provider embedding request failed")
  }
}

export function getEmbeddingModel(provider: EmbeddingProvider) {
  return getProjectEmbeddingModel(provider)
}

export function getPrivateOpenRouterEmbeddingSettings(
  dimensions: number | null = EMBEDDING_DIMENSIONS
): OpenRouterEmbeddingSettings {
  return {
    extraBody: {
      ...(dimensions === null ? {} : { dimensions }),
      encoding_format: "float",
      provider: PRIVATE_OPENROUTER_ROUTING,
    },
  }
}

export function validateEmbeddings(
  embeddings: number[][],
  expectedCount: number,
  dimensions = EMBEDDING_DIMENSIONS
) {
  if (
    embeddings.length !== expectedCount ||
    embeddings.some(
      (embedding) =>
        embedding.length !== dimensions ||
        embedding.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Provider returned invalid embeddings")
  }
  return embeddings
}

function coerceEmbeddings(
  embeddings: number[][],
  expectedCount: number,
  dimensions: number,
  reduceNativeDimensions: boolean
) {
  if (!reduceNativeDimensions)
    return validateEmbeddings(embeddings, expectedCount, dimensions)
  if (embeddings.length !== expectedCount)
    throw new Error("Provider returned invalid embeddings")
  const reduced = embeddings.map((embedding) =>
    toFixedDimensionEmbedding(embedding, dimensions)
  )
  if (reduced.some((embedding) => embedding === null))
    throw new Error("Provider returned invalid embeddings")
  return reduced as number[][]
}

export async function createProviderEmbeddings(
  token: string,
  provider: EmbeddingProvider,
  input: string[],
  options: EmbeddingRequestOptions = {}
) {
  if (!input.length) return []
  const dimensions = options.dimensions ?? EMBEDDING_DIMENSIONS
  const modelId = options.model ?? getEmbeddingModel(provider)
  const reduceNativeDimensions = options.reduceNativeDimensions === true
  try {
    const model =
      provider === "openrouter"
        ? createUserOpenRouter(token).textEmbeddingModel(
            modelId,
            getPrivateOpenRouterEmbeddingSettings(
              reduceNativeDimensions ? null : dimensions
            )
          )
        : createOpenAI({ apiKey: token }).embeddingModel(modelId)
    const { embeddings } = await embedMany({
      model,
      values: input,
      abortSignal: AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS),
      ...(provider === "openai"
        ? {
            providerOptions: {
              openai: { dimensions },
            },
          }
        : {}),
    })
    return coerceEmbeddings(
      embeddings,
      input.length,
      dimensions,
      reduceNativeDimensions
    )
  } catch (cause) {
    if (cause instanceof ProviderEmbeddingError) throw cause
    const statusCode = APICallError.isInstance(cause)
      ? cause.statusCode
      : undefined
    throw new ProviderEmbeddingError(statusCode)
  }
}

export async function createMemoryEmbeddings(
  token: string,
  provider: EmbeddingProvider,
  input: string[]
) {
  const policy = getMemoryProcessingPolicy(provider)
  return await createProviderEmbeddings(token, provider, input, {
    dimensions: policy.dimensions,
    model: policy.embeddingModel,
    reduceNativeDimensions: provider === "openrouter",
  })
}
