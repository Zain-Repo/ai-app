import { v } from "convex/values"

export const providerUsageValidator = v.object({
  provider: v.literal("openrouter"),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
  cachedInputTokens: v.optional(v.number()),
  reasoningTokens: v.optional(v.number()),
  costUsd: v.optional(v.number()),
})

export type ProviderUsage = {
  provider: "openrouter"
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cachedInputTokens?: number
  reasoningTokens?: number
  costUsd?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readTokenCount(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) >= 0
    ? Number(value)
    : undefined
}

function readCost(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function readOpenRouterStepUsage(value: unknown): ProviderUsage | null {
  if (!isRecord(value)) return null
  const providerMetadata = value.providerMetadata
  if (!isRecord(providerMetadata)) return null
  const openrouter = providerMetadata.openrouter
  if (!isRecord(openrouter) || !isRecord(openrouter.usage)) return null

  const usage = openrouter.usage
  const inputTokens = readTokenCount(usage.promptTokens)
  const outputTokens = readTokenCount(usage.completionTokens)
  const totalTokens = readTokenCount(usage.totalTokens)
  if (
    inputTokens === undefined ||
    outputTokens === undefined ||
    totalTokens === undefined
  )
    return null

  const promptDetails = isRecord(usage.promptTokensDetails)
    ? usage.promptTokensDetails
    : undefined
  const completionDetails = isRecord(usage.completionTokensDetails)
    ? usage.completionTokensDetails
    : undefined
  const cachedInputTokens = readTokenCount(promptDetails?.cachedTokens)
  const reasoningTokens = readTokenCount(completionDetails?.reasoningTokens)
  const costUsd = readCost(usage.cost)

  return {
    provider: "openrouter",
    inputTokens,
    outputTokens,
    totalTokens,
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    ...(costUsd === undefined ? {} : { costUsd }),
  }
}

export function aggregateOpenRouterUsage(
  steps: readonly unknown[]
): ProviderUsage | undefined {
  if (!steps.length) return undefined
  const usage = steps.map(readOpenRouterStepUsage)
  if (usage.some((step) => step === null)) return undefined

  const completeUsage = usage as ProviderUsage[]
  const hasCachedInputTokens = completeUsage.every(
    (step) => step.cachedInputTokens !== undefined
  )
  const hasReasoningTokens = completeUsage.every(
    (step) => step.reasoningTokens !== undefined
  )
  const hasCost = completeUsage.every((step) => step.costUsd !== undefined)

  return completeUsage.reduce<ProviderUsage>(
    (total, step) => ({
      provider: "openrouter",
      inputTokens: total.inputTokens + step.inputTokens,
      outputTokens: total.outputTokens + step.outputTokens,
      totalTokens: total.totalTokens + step.totalTokens,
      ...(hasCachedInputTokens
        ? {
            cachedInputTokens:
              (total.cachedInputTokens ?? 0) + (step.cachedInputTokens ?? 0),
          }
        : {}),
      ...(hasReasoningTokens
        ? {
            reasoningTokens:
              (total.reasoningTokens ?? 0) + (step.reasoningTokens ?? 0),
          }
        : {}),
      ...(hasCost
        ? { costUsd: (total.costUsd ?? 0) + (step.costUsd ?? 0) }
        : {}),
    }),
    {
      provider: "openrouter",
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    }
  )
}

export function assertValidProviderUsage(usage: ProviderUsage) {
  if (
    readTokenCount(usage.inputTokens) === undefined ||
    readTokenCount(usage.outputTokens) === undefined ||
    readTokenCount(usage.totalTokens) === undefined ||
    (usage.cachedInputTokens !== undefined &&
      readTokenCount(usage.cachedInputTokens) === undefined) ||
    (usage.reasoningTokens !== undefined &&
      readTokenCount(usage.reasoningTokens) === undefined) ||
    (usage.costUsd !== undefined && readCost(usage.costUsd) === undefined)
  )
    throw new Error("Provider usage is invalid")
}
