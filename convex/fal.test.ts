import { describe, expect, it, vi } from "vitest"

import {
  FAL_IMAGE_MODELS,
  buildFalImageRequest,
  generateFalImage,
  parseFalImageModels,
} from "./fal"

const REQUEST_ID = "request_12345678"
const ENDPOINT = "fal-ai/flux-2/klein/4b"
const STATUS_URL = `https://queue.fal.run/${ENDPOINT}/requests/${REQUEST_ID}/status`
const RESPONSE_URL = `https://queue.fal.run/${ENDPOINT}/requests/${REQUEST_ID}/response`

describe("Fal image provider", () => {
  it("exposes only supported active image models with current pricing", () => {
    expect(
      parseFalImageModels(
        {
          models: [
            {
              endpoint_id: ENDPOINT,
              metadata: {
                category: "text-to-image",
                display_name: "FLUX.2 Klein 4B",
                status: "active",
              },
            },
            {
              endpoint_id: "fal-ai/unsupported",
              metadata: {
                category: "text-to-image",
                display_name: "Unsupported",
                status: "active",
              },
            },
          ],
        },
        {
          prices: [
            {
              currency: "USD",
              endpoint_id: ENDPOINT,
              unit: "image",
              unit_price: 0.014,
            },
          ],
        }
      )
    ).toEqual([
      expect.objectContaining({
        description: expect.stringContaining("$0.014 / image"),
        label: "FLUX.2 Klein 4B",
        outputMode: "image",
        provider: "fal",
        value: ENDPOINT,
      }),
    ])
  })

  it("uses each model's documented editing input", () => {
    expect(
      buildFalImageRequest(ENDPOINT, "edit", ["https://one.test"])
    ).toEqual({
      endpoint: `${ENDPOINT}/edit`,
      input: { image_urls: ["https://one.test"], prompt: "edit" },
    })
    expect(() =>
      buildFalImageRequest("fal-ai/recraft/v3/text-to-image", "edit", [
        "https://one.test",
        "https://two.test",
      ])
    ).toThrow("one reference image")
  })

  it("covers the curated model endpoints and per-model reference limits", () => {
    expect(FAL_IMAGE_MODELS.map((model) => model.id)).toEqual([
      "fal-ai/flux-2/klein/4b",
      "fal-ai/flux-2/klein/9b",
      "fal-ai/flux-2",
      "fal-ai/flux-2/flash",
      "fal-ai/flux-2/turbo",
      "fal-ai/flux-2-flex",
      "fal-ai/flux-2-pro",
      "fal-ai/flux-2-max",
      "fal-ai/flux-pro/kontext/text-to-image",
      "google/nano-banana-lite",
      "fal-ai/nano-banana-2",
      "fal-ai/nano-banana-pro",
      "fal-ai/gpt-image-1.5",
      "openai/gpt-image-2",
      "fal-ai/recraft/v3/text-to-image",
      "fal-ai/ideogram/v3",
      "ideogram/v4",
      "fal-ai/qwen-image-2/text-to-image",
      "fal-ai/qwen-image-2/pro/text-to-image",
      "fal-ai/bytedance/seedream/v4.5/text-to-image",
      "bytedance/seedream/v5/lite/text-to-image",
      "bytedance/seedream/v5/pro/text-to-image",
      "reve/2.1/text-to-image",
      "xai/grok-imagine-image",
    ])
    expect(
      buildFalImageRequest("openai/gpt-image-2", "edit", [
        "https://one.test",
        "https://two.test",
      ])
    ).toEqual({
      endpoint: "openai/gpt-image-2/edit",
      input: {
        image_urls: ["https://one.test", "https://two.test"],
        prompt: "edit",
      },
    })
    expect(() =>
      buildFalImageRequest("xai/grok-imagine-image", "edit", [
        "https://one.test",
        "https://two.test",
        "https://three.test",
        "https://four.test",
      ])
    ).toThrow("at most 3 reference images")
    expect(() =>
      buildFalImageRequest("fal-ai/qwen-image-2/text-to-image", "edit", [
        "https://one.test",
        "https://two.test",
        "https://three.test",
        "https://four.test",
      ])
    ).toThrow("at most 3 reference images")
    expect(
      buildFalImageRequest("ideogram/v4", "edit", ["https://one.test"])
    ).toEqual({
      endpoint: "ideogram/v4/image-to-image",
      input: { image_url: "https://one.test", prompt: "edit" },
    })
  })

  it("submits, polls, and downloads through trusted Fal URLs", async () => {
    const waits: number[] = []
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, _init?: RequestInit) => {
        const url = input.toString()
        if (url === `https://queue.fal.run/${ENDPOINT}`)
          return Response.json({
            request_id: REQUEST_ID,
            response_url: RESPONSE_URL,
            status_url: STATUS_URL,
          })
        if (url === STATUS_URL) {
          const pending =
            fetcher.mock.calls.filter(
              ([called]) => called.toString() === STATUS_URL
            ).length === 1
          return Response.json({ status: pending ? "IN_QUEUE" : "COMPLETED" })
        }
        if (url === RESPONSE_URL)
          return Response.json({
            images: [{ url: "https://v3.fal.media/files/generated.png" }],
          })
        if (url === "https://v3.fal.media/files/generated.png")
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          })
        throw new Error(`Unexpected request: ${url}`)
      }
    )

    const image = await generateFalImage(
      "secret-key",
      { model: ENDPOINT, prompt: "a lighthouse", referenceUrls: [] },
      {
        fetcher,
        now: () => 0,
        wait: async (milliseconds) => {
          waits.push(milliseconds)
        },
      }
    )

    expect(image).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
      extension: "png",
    })
    expect(waits).toEqual([1_000])
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ prompt: "a lighthouse" }),
      headers: {
        Authorization: "Key secret-key",
        "Content-Type": "application/json",
      },
      method: "POST",
    })
  })
})
