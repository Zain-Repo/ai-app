import { describe, expect, it, vi } from "vitest"

import {
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
