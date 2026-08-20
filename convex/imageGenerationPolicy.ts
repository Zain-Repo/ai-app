import { v } from "convex/values"

import type {
  ImageGenerationConfig,
  ImageModelCapability,
  ImageProvider,
} from "../shared/image-generation"

export const imageProviderValidator = v.union(
  v.literal("fal"),
  v.literal("openrouter"),
  v.literal("ai_gateway")
)

export const imageOutputFormatValidator = v.union(
  v.literal("jpeg"),
  v.literal("png"),
  v.literal("webp")
)

export const imageGenerationConfigValidator = v.object({
  dimension: v.string(),
  resolution: v.optional(v.string()),
  count: v.number(),
  maxImages: v.optional(v.number()),
  outputFormat: imageOutputFormatValidator,
  quality: v.optional(v.string()),
  background: v.optional(v.string()),
  seed: v.optional(v.number()),
  style: v.optional(v.string()),
  promptExpansion: v.optional(v.boolean()),
})

const imageSelectOptionValidator = v.object({
  label: v.string(),
  value: v.string(),
})

const imageDimensionOptionValidator = imageSelectOptionValidator.extend({
  width: v.number(),
  height: v.number(),
})

export const imageModelCapabilityValidator = v.object({
  schemaVersion: v.number(),
  revision: v.string(),
  provider: imageProviderValidator,
  modelId: v.string(),
  endpoint: v.optional(v.string()),
  modes: v.array(v.union(v.literal("imageToImage"), v.literal("textToImage"))),
  dimensions: v.object({
    parameter: v.union(
      v.literal("aspect_ratio"),
      v.literal("image_size"),
      v.literal("size")
    ),
    options: v.array(imageDimensionOptionValidator),
    default: v.string(),
    sendParameter: v.optional(v.boolean()),
  }),
  resolutions: v.optional(
    v.object({
      parameter: v.literal("resolution"),
      options: v.array(imageSelectOptionValidator),
      default: v.string(),
    })
  ),
  multiplicity: v.union(
    v.object({
      kind: v.literal("imagesPerRequest"),
      parameter: v.union(v.literal("n"), v.literal("num_images")),
      providerMin: v.number(),
      providerMax: v.number(),
      appMax: v.number(),
      default: v.number(),
      sendParameter: v.optional(v.boolean()),
    }),
    v.object({
      kind: v.literal("generationsWithVariableImages"),
      generationParameter: v.literal("num_images"),
      generationMin: v.number(),
      generationMax: v.number(),
      maxImagesParameter: v.literal("max_images"),
      maxImagesMin: v.number(),
      maxImagesMax: v.number(),
      appMaxTotalOutputs: v.number(),
      defaultGenerations: v.number(),
      defaultMaxImages: v.number(),
    })
  ),
  references: v.object({ max: v.number() }),
  options: v.object({
    backgrounds: v.optional(v.array(imageSelectOptionValidator)),
    defaultBackground: v.optional(v.string()),
    defaultOutputFormat: imageOutputFormatValidator,
    outputFormats: v.array(imageOutputFormatValidator),
    outputFormatParameter: v.optional(v.boolean()),
    promptExpansion: v.optional(v.boolean()),
    qualities: v.optional(v.array(imageSelectOptionValidator)),
    defaultQuality: v.optional(v.string()),
    seed: v.optional(v.boolean()),
    styles: v.optional(v.array(imageSelectOptionValidator)),
    defaultStyle: v.optional(v.string()),
  }),
  pricing: v.object({
    kind: v.union(
      v.literal("exact"),
      v.literal("from"),
      v.literal("range"),
      v.literal("unknown")
    ),
    currency: v.literal("USD"),
    display: v.optional(v.string()),
  }),
})

export const imageGenerationSetStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("partial"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("canceled")
)

export const imageGenerationJobStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("complete"),
  v.literal("failed"),
  v.literal("canceled")
)

export const imageGenerationOutputStatusValidator = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled")
)

export function buildProviderImageInput(
  capability: ImageModelCapability,
  config: ImageGenerationConfig
): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  if (capability.dimensions.sendParameter !== false)
    input[capability.dimensions.parameter] = config.dimension

  if (capability.resolutions && config.resolution)
    input[capability.resolutions.parameter] = config.resolution

  if (capability.multiplicity.kind === "imagesPerRequest") {
    if (capability.multiplicity.sendParameter !== false)
      input[capability.multiplicity.parameter] = config.count
  } else {
    input[capability.multiplicity.generationParameter] = config.count
    input[capability.multiplicity.maxImagesParameter] = config.maxImages
  }

  if (capability.options.outputFormatParameter)
    input.output_format = config.outputFormat
  if (config.quality) input.quality = config.quality
  if (config.background) input.background = config.background
  if (config.seed !== undefined) input.seed = config.seed
  if (config.style) input.style = config.style
  if (config.promptExpansion !== undefined)
    input.enable_prompt_expansion = config.promptExpansion

  return input
}

export function asImageProvider(value: string): ImageProvider {
  if (value === "fal" || value === "openrouter" || value === "ai_gateway")
    return value
  throw new Error(
    "Image generation requires OpenRouter, Vercel AI Gateway, or Fal"
  )
}
