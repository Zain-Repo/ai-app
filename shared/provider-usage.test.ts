import { describe, expect, it } from "vitest"

import {
  aggregateOpenRouterUsage,
  assertValidProviderUsage,
} from "./provider-usage"

function createStep(usage: Record<string, unknown>): {
  providerMetadata: { openrouter: { usage: Record<string, unknown> } }
} {
  return { providerMetadata: { openrouter: { usage } } }
}

describe("OpenRouter usage accounting", () => {
  it("aggregates authoritative billed usage across AI SDK tool steps", () => {
    expect(
      aggregateOpenRouterUsage([
        createStep({
          promptTokens: 100,
          promptTokensDetails: { cachedTokens: 40 },
          completionTokens: 20,
          completionTokensDetails: { reasoningTokens: 5 },
          totalTokens: 120,
          cost: 0.004,
        }),
        createStep({
          promptTokens: 140,
          promptTokensDetails: { cachedTokens: 100 },
          completionTokens: 10,
          completionTokensDetails: { reasoningTokens: 2 },
          totalTokens: 150,
          cost: 0.003,
        }),
      ])
    ).toEqual({
      provider: "openrouter",
      inputTokens: 240,
      outputTokens: 30,
      totalTokens: 270,
      cachedInputTokens: 140,
      reasoningTokens: 7,
      costUsd: 0.007,
    })
  })

  it("omits optional totals unless every step reports them", () => {
    expect(
      aggregateOpenRouterUsage([
        createStep({
          promptTokens: 10,
          completionTokens: 2,
          totalTokens: 12,
          cost: 0.001,
        }),
        createStep({
          promptTokens: 20,
          completionTokens: 3,
          totalTokens: 23,
        }),
      ])
    ).toEqual({
      provider: "openrouter",
      inputTokens: 30,
      outputTokens: 5,
      totalTokens: 35,
    })
  })

  it("rejects incomplete or malformed provider metadata", () => {
    expect(aggregateOpenRouterUsage([])).toBeUndefined()
    expect(aggregateOpenRouterUsage([{}])).toBeUndefined()
    expect(
      aggregateOpenRouterUsage([
        createStep({
          promptTokens: -1,
          completionTokens: 2,
          totalTokens: 1,
        }),
      ])
    ).toBeUndefined()
  })

  it("rejects invalid values before Convex persistence", () => {
    expect(() =>
      assertValidProviderUsage({
        provider: "openrouter",
        inputTokens: 10.5,
        outputTokens: 2,
        totalTokens: 12,
      })
    ).toThrow("Provider usage is invalid")
    expect(() =>
      assertValidProviderUsage({
        provider: "openrouter",
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
        costUsd: Number.POSITIVE_INFINITY,
      })
    ).toThrow("Provider usage is invalid")
  })
})
