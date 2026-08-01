import { describe, expect, it } from "vitest"

import {
  getOpenRouterModelEndpointsUrl,
  OPENAI_MODELS,
  isOpenRouterEndpointCatalog,
  isValidSdpOffer,
  parseOpenAIModels,
  parseOpenRouterCreditStatus,
  parseOpenRouterEndpoints,
  parseOpenRouterModels,
  resolveRealtimeVoice,
} from "./providerOAuth"

describe("OpenAI model catalog", () => {
  it("accepts SDP offers and limits realtime voice selection", () => {
    expect(isValidSdpOffer("v=0\r\no=- 0 0 IN IP4 127.0.0.1")).toBe(true)
    expect(isValidSdpOffer("not-sdp")).toBe(false)
    expect(resolveRealtimeVoice("cedar")).toBe("cedar")
    expect(resolveRealtimeVoice("unknown")).toBe("marin")
  })

  it("offers the latest frontier API model IDs without older families", () => {
    const modelIds = OPENAI_MODELS.map((model) => model.value)

    expect(modelIds).toEqual([
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5.5",
      "gpt-5.5-pro",
      "gpt-5.4",
      "gpt-5.4-pro",
      "gpt-5.4-mini",
      "gpt-5.4-nano",
    ])
  })

  it("keeps only current models available to the connected API key", () => {
    expect(
      parseOpenAIModels([
        { id: "gpt-5.6-sol" },
        { id: "gpt-5.4-mini" },
        { id: "gpt-4.1" },
        { id: "text-embedding-3-small" },
      ]).map((model) => model.value)
    ).toEqual(["gpt-5.6-sol", "gpt-5.4-mini"])
  })
})

describe("OpenRouter model catalog", () => {
  it("keeps newest-first models and labels their capabilities", () => {
    expect(
      parseOpenRouterModels([
        {
          id: "openai/gpt-image-latest",
          name: "OpenAI: GPT Image Latest",
          context_length: 400_000,
          architecture: {
            input_modalities: ["text", "image"],
            output_modalities: ["image"],
          },
        },
        {
          id: "openai/gpt-latest",
          name: "OpenAI: GPT Latest",
          context_length: 1_050_000,
          reasoning: {
            supported_efforts: ["high", "medium", "low", "invalid"],
            default_effort: "low",
            mandatory: true,
          },
          architecture: {
            input_modalities: ["text", "image", "file"],
            output_modalities: ["text"],
          },
        },
        {
          id: "poolside/laguna-s-2.1",
          name: "Poolside: Laguna S 2.1",
          context_length: 1_048_576,
          reasoning: { mandatory: false, default_enabled: true },
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
        },
      ])
    ).toEqual([
      {
        provider: "openai",
        value: "openai/gpt-image-latest",
        label: "GPT Image Latest",
        description: "Image generation · 400K context",
        outputMode: "image",
      },
      {
        provider: "openai",
        value: "openai/gpt-latest",
        label: "GPT Latest",
        description: "Chat · Vision · Files · 1.1M context",
        outputMode: "text",
        reasoningEfforts: ["high", "medium", "low"],
        defaultReasoningEffort: "low",
      },
      {
        provider: "poolside",
        value: "poolside/laguna-s-2.1",
        label: "Laguna S 2.1",
        description: "Chat · 1M context",
        outputMode: "text",
      },
    ])
  })

  it("uses all gateway efforts when the provider accepts any effort", () => {
    expect(
      parseOpenRouterModels([
        {
          id: "google/gemini-thinking",
          name: "Google: Gemini Thinking",
          reasoning: {
            supported_efforts: null,
            default_effort: "medium",
          },
          architecture: {
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
        },
      ])[0]
    ).toMatchObject({
      reasoningEfforts: [
        "max",
        "xhigh",
        "high",
        "medium",
        "low",
        "minimal",
        "none",
      ],
      defaultReasoningEffort: "medium",
    })
  })
})

describe("OpenRouter model endpoints", () => {
  it("builds endpoint URLs for canonical aliases and image models", () => {
    expect(getOpenRouterModelEndpointsUrl("~x-ai/grok-latest")).toBe(
      "https://openrouter.ai/api/v1/models/~x-ai/grok-latest/endpoints"
    )
    expect(getOpenRouterModelEndpointsUrl("openai/gpt-image-2")).toBe(
      "https://openrouter.ai/api/v1/models/openai/gpt-image-2/endpoints"
    )
    expect(getOpenRouterModelEndpointsUrl("acme:beta/image-model")).toBe(
      "https://openrouter.ai/api/v1/models/acme%3Abeta/image-model/endpoints"
    )
  })

  it("rejects malformed model IDs without allowing path injection", () => {
    for (const model of [
      "openai",
      "openai/gpt-image-1/extra",
      "openai/../endpoints",
      "~openai/gpt image 1",
      "openai~/gpt-image-1",
      "~/gpt-image-1",
    ]) {
      expect(() => getOpenRouterModelEndpointsUrl(model)).toThrow(
        "Model is unavailable"
      )
    }
  })

  it("treats a successful endpoint response with no endpoints as empty", () => {
    const emptyCatalog = { data: { endpoints: [] } }

    expect(isOpenRouterEndpointCatalog(emptyCatalog)).toBe(true)
    expect(parseOpenRouterEndpoints(emptyCatalog)).toEqual([])
  })

  it("rejects malformed endpoint catalogs before treating them as empty", () => {
    expect(isOpenRouterEndpointCatalog(null)).toBe(false)
    expect(isOpenRouterEndpointCatalog({ data: {} })).toBe(false)
    expect(isOpenRouterEndpointCatalog({ data: { endpoints: {} } })).toBe(false)
  })

  it("keeps available endpoints and sorts live per-token prices per million", () => {
    expect(
      parseOpenRouterEndpoints({
        data: {
          endpoints: [
            {
              provider_name: "Expensive",
              tag: "expensive/fp8",
              status: 0,
              pricing: { prompt: "0.0000002", completion: "0.0000004" },
            },
            {
              provider_name: "Offline",
              tag: "offline",
              status: 1,
              pricing: { prompt: "0", completion: "0" },
            },
            {
              provider_name: "Poolside",
              tag: "poolside/bf16",
              status: 0,
              context_length: 1_048_576,
              quantization: "bf16",
              uptime_last_1d: 99.99887844597474,
              throughput_last_30m: { p50: 77, p90: 171 },
              pricing: {
                prompt: "0.0000001",
                completion: "0.0000002",
                input_cache_read: "0.00000001",
              },
            },
          ],
        },
      })
    ).toEqual([
      {
        providerName: "Poolside",
        providerTag: "poolside/bf16",
        promptPrice: 0.1,
        completionPrice: 0.2,
        cacheReadPrice: 0.01,
        contextLength: 1_048_576,
        quantization: "bf16",
        uptime: 99.99887844597474,
        throughput: 77,
      },
      {
        providerName: "Expensive",
        providerTag: "expensive/fp8",
        promptPrice: 0.2,
        completionPrice: 0.4,
      },
    ])
  })

  it("converts image output tokens to the estimated 1K image price", () => {
    expect(
      parseOpenRouterEndpoints({
        data: {
          endpoints: [
            {
              provider_name: "Black Forest Labs",
              tag: "black-forest-labs",
              status: 0,
              pricing: {
                prompt: "0",
                completion: "0",
                image_output: "0.00000341796875",
              },
            },
          ],
        },
      })
    ).toMatchObject([{ imagePrice: 0.014 }])
  })
})

describe("OpenRouter credit status", () => {
  it("keeps key usage and nullable spending limits", () => {
    expect(
      parseOpenRouterCreditStatus({
        data: {
          is_free_tier: false,
          limit: 10,
          limit_remaining: 1.25,
          usage: 8.75,
        },
      })
    ).toEqual({
      isFreeTier: false,
      limit: 10,
      remaining: 1.25,
      usage: 8.75,
    })
    expect(
      parseOpenRouterCreditStatus({
        data: {
          is_free_tier: true,
          limit: null,
          limit_remaining: null,
          usage: 0,
        },
      })
    ).toMatchObject({ limit: null, remaining: null })
  })
})
