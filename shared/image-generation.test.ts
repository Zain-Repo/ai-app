import { describe, expect, it } from "vitest"

import { buildProviderImageInput } from "../convex/imageGenerationPolicy"
import {
  getDefaultImageGenerationConfig,
  getImageOutputRange,
  getStaticImageModelCapability,
  validateImageGenerationConfig,
} from "./image-generation"

function getCapability(model: string) {
  const capability = getStaticImageModelCapability("fal", model)
  if (!capability) throw new Error(`Missing fixture capability for ${model}`)
  return capability
}

describe("image generation capabilities", () => {
  it("derives safe defaults and exact multi-output ranges", () => {
    const capability = getCapability("fal-ai/nano-banana-2")
    const config = {
      ...getDefaultImageGenerationConfig(capability),
      count: 4,
    }

    expect(validateImageGenerationConfig(capability, config)).toEqual(config)
    expect(getImageOutputRange(capability, config)).toEqual({
      maximum: 4,
      minimum: 4,
    })
  })

  it("bounds variable output models to the application maximum", () => {
    const capability = getCapability(
      "fal-ai/bytedance/seedream/v4.5/text-to-image"
    )
    const config = {
      ...getDefaultImageGenerationConfig(capability),
      count: 2,
      maxImages: 2,
    }

    expect(getImageOutputRange(capability, config)).toEqual({
      maximum: 4,
      minimum: 2,
    })
    expect(() =>
      validateImageGenerationConfig(capability, {
        ...config,
        count: 3,
      })
    ).toThrow("generation range")
  })

  it("rejects transparent JPEG output", () => {
    const capability = getCapability("fal-ai/gpt-image-1.5")
    expect(() =>
      validateImageGenerationConfig(capability, {
        ...getDefaultImageGenerationConfig(capability),
        background: "transparent",
        outputFormat: "jpeg",
      })
    ).toThrow("Transparent images")
  })

  it("sends only parameters declared by the selected capability", () => {
    const capability = getCapability("fal-ai/nano-banana-2")
    expect(
      buildProviderImageInput(capability, {
        ...getDefaultImageGenerationConfig(capability),
        count: 3,
        dimension: "16:9",
        outputFormat: "webp",
        resolution: "2K",
        seed: 7,
      })
    ).toEqual({
      aspect_ratio: "16:9",
      num_images: 3,
      output_format: "webp",
      resolution: "2K",
      seed: 7,
    })
  })
})
