"use node"

import { createOpenAI } from "@ai-sdk/openai"
import type { OpenRouterEmbeddingSettings } from "@openrouter/ai-sdk-provider"
import { APICallError, embedMany } from "ai"

import { createUserOpenRouter } from "../shared/openrouter-provider"
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

export function getPrivateOpenRouterEmbeddingSettings(): OpenRouterEmbeddingSettings {
  return {
    extraBody: {
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
      provider: PRIVATE_OPENROUTER_ROUTING,
    },
  }
}

export function validateEmbeddings(
  embeddings: number[][],
  expectedCount: number
) {
  if (
    embeddings.length !== expectedCount ||
    embeddings.some(
      (embedding) =>
        embedding.length !== EMBEDDING_DIMENSIONS ||
        embedding.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new Error("Provider returned invalid embeddings")
  }
  return embeddings
}

export async function createProviderEmbeddings(
  token: string,
  provider: EmbeddingProvider,
  input: string[]
) {
  if (!input.length) return []
  try {
    const model =
      provider === "openrouter"
        ? createUserOpenRouter(token).textEmbeddingModel(
            OPENROUTER_EMBEDDING_MODEL,
            getPrivateOpenRouterEmbeddingSettings()
          )
        : createOpenAI({ apiKey: token }).embeddingModel(OPENAI_EMBEDDING_MODEL)
    const { embeddings } = await embedMany({
      model,
      values: input,
      abortSignal: AbortSignal.timeout(EMBEDDING_REQUEST_TIMEOUT_MS),
      ...(provider === "openai"
        ? {
            providerOptions: {
              openai: { dimensions: EMBEDDING_DIMENSIONS },
            },
          }
        : {}),
    })
    return validateEmbeddings(embeddings, input.length)
  } catch (cause) {
    if (cause instanceof ProviderEmbeddingError) throw cause
    const statusCode = APICallError.isInstance(cause)
      ? cause.statusCode
      : undefined
    throw new ProviderEmbeddingError(statusCode)
  }
}
