import { describe, expect, it } from "vitest"

import {
  parseOpenRouterImageCapability,
  parseOpenRouterImageRoutes,
} from "./imageModelCapabilities"

describe("OpenRouter image capability parsing", () => {
  it("intersects auto-route capabilities across eligible endpoints", () => {
    const capability = parseOpenRouterImageCapability(
      {
        data: {
          endpoints: [
            {
              name: "Host A",
              provider_name: "host-a",
              pricing: [
                { billable: "output_image", cost_usd: 0.02, unit: "image" },
              ],
              supported_parameters: {
                aspect_ratio: { type: "enum", values: ["1:1", "16:9"] },
                n: { type: "range", min: 1, max: 4 },
                output_format: {
                  type: "enum",
                  values: ["png", "jpeg"],
                },
              },
            },
            {
              name: "Host B",
              provider_name: "host-b",
              pricing: [
                { billable: "output_image", cost_usd: 0.03, unit: "image" },
              ],
              supported_parameters: {
                aspect_ratio: { type: "enum", values: ["1:1", "9:16"] },
                n: { type: "range", min: 1, max: 2 },
                output_format: { type: "enum", values: ["png", "webp"] },
              },
            },
          ],
        },
      },
      "vendor/model",
      "auto"
    )

    expect(capability.dimensions.options.map((option) => option.value)).toEqual(
      ["1:1"]
    )
    expect(capability.multiplicity).toMatchObject({
      appMax: 2,
      providerMin: 1,
      providerMax: 2,
    })
    expect(capability.options.outputFormats).toEqual(["png"])
    expect(capability.pricing).toMatchObject({ kind: "range" })
  })

  it("rejects automatic routes without a common raster format", () => {
    expect(() =>
      parseOpenRouterImageCapability(
        {
          endpoints: [
            {
              provider_tag: "raster-host",
              supported_parameters: {
                output_format: { type: "enum", values: ["png"] },
              },
            },
            {
              provider_tag: "vector-host",
              supported_parameters: {
                output_format: { type: "enum", values: ["svg"] },
              },
            },
          ],
        },
        "vendor/model",
        "auto"
      )
    ).toThrow("supported raster format")
  })

  it("uses the intersected provider minimum output count", () => {
    const capability = parseOpenRouterImageCapability(
      {
        endpoints: [
          {
            provider_tag: "host-a",
            supported_parameters: {
              n: { type: "range", min: 2, max: 4 },
            },
          },
        ],
      },
      "vendor/model"
    )
    expect(capability.multiplicity).toMatchObject({
      default: 2,
      providerMin: 2,
      providerMax: 4,
    })
    expect(() =>
      parseOpenRouterImageCapability(
        {
          endpoints: [
            { provider_tag: "single", supported_parameters: {} },
            {
              provider_tag: "multiple",
              supported_parameters: {
                n: { type: "range", min: 2, max: 4 },
              },
            },
          ],
        },
        "vendor/model"
      )
    ).toThrow("no common output count")
  })

  it("lists only raster-compatible routes from the dedicated endpoint data", () => {
    expect(
      parseOpenRouterImageRoutes(
        {
          endpoints: [
            {
              provider_name: "Raster Host",
              provider_tag: "raster-host",
              supported_parameters: {
                output_format: { type: "enum", values: ["png", "webp"] },
              },
            },
            {
              provider_name: "Vector Host",
              provider_tag: "vector-host",
              supported_parameters: {
                output_format: { type: "enum", values: ["svg"] },
              },
            },
          ],
        },
        "vendor/model"
      )
    ).toEqual([
      {
        value: "raster-host",
        label: "Raster Host",
        description: "Dedicated image generation endpoint",
      },
    ])
  })

  it("does not invalidate settings when only provider pricing changes", () => {
    const endpoint = {
      provider_name: "Host A",
      provider_tag: "host-a",
      supported_parameters: {
        aspect_ratio: { type: "enum", values: ["1:1"] },
      },
    }
    const before = parseOpenRouterImageCapability(
      {
        endpoints: [
          {
            ...endpoint,
            pricing: [
              { billable: "output_image", cost_usd: 0.02, unit: "image" },
            ],
          },
        ],
      },
      "vendor/model"
    )
    const after = parseOpenRouterImageCapability(
      {
        endpoints: [
          {
            ...endpoint,
            pricing: [
              { billable: "output_image", cost_usd: 0.03, unit: "image" },
            ],
          },
        ],
      },
      "vendor/model"
    )

    expect(after.revision).toBe(before.revision)
    expect(after.pricing.display).not.toBe(before.pricing.display)
  })
})
