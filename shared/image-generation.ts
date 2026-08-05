export const IMAGE_CAPABILITY_SCHEMA_VERSION = 1
export const IMAGE_STUDIO_APP_MAX_OUTPUTS = 4
export const IMAGE_STUDIO_MAX_REFERENCES = 5

export type ImageProvider = "fal" | "openrouter"
export type ImageOutputFormat = "jpeg" | "png" | "webp"
export type ImageDimensionParameter = "aspect_ratio" | "image_size" | "size"

export type ImageDimensionOption = {
  label: string
  value: string
  width: number
  height: number
}

export type ImageSelectOption = {
  label: string
  value: string
}

export type ImageMultiplicity =
  | {
      kind: "imagesPerRequest"
      parameter: "n" | "num_images"
      providerMin: number
      providerMax: number
      appMax: number
      default: number
      sendParameter?: boolean
    }
  | {
      kind: "generationsWithVariableImages"
      generationParameter: "num_images"
      generationMin: number
      generationMax: number
      maxImagesParameter: "max_images"
      maxImagesMin: number
      maxImagesMax: number
      appMaxTotalOutputs: number
      defaultGenerations: number
      defaultMaxImages: number
    }

export type ImageModelCapability = {
  schemaVersion: number
  revision: string
  provider: ImageProvider
  modelId: string
  endpoint?: string
  modes: Array<"imageToImage" | "textToImage">
  dimensions: {
    parameter: ImageDimensionParameter
    options: ImageDimensionOption[]
    default: string
    sendParameter?: boolean
  }
  resolutions?: {
    parameter: "resolution"
    options: ImageSelectOption[]
    default: string
  }
  multiplicity: ImageMultiplicity
  references: {
    max: number
  }
  options: {
    backgrounds?: ImageSelectOption[]
    defaultBackground?: string
    defaultOutputFormat: ImageOutputFormat
    outputFormats: ImageOutputFormat[]
    outputFormatParameter?: boolean
    promptExpansion?: boolean
    qualities?: ImageSelectOption[]
    defaultQuality?: string
    seed?: boolean
    styles?: ImageSelectOption[]
    defaultStyle?: string
  }
  pricing: {
    kind: "exact" | "from" | "range" | "unknown"
    currency: "USD"
    display?: string
  }
}

export type ImageGenerationConfig = {
  dimension: string
  resolution?: string
  count: number
  maxImages?: number
  outputFormat: ImageOutputFormat
  quality?: string
  background?: string
  seed?: number
  style?: string
  promptExpansion?: boolean
}

const squareAndOrientationSizes: ImageDimensionOption[] = [
  { value: "square_hd", label: "Square HD", width: 1, height: 1 },
  { value: "square", label: "Square", width: 1, height: 1 },
  { value: "portrait_4_3", label: "Portrait 3:4", width: 3, height: 4 },
  { value: "portrait_16_9", label: "Portrait 9:16", width: 9, height: 16 },
  { value: "landscape_4_3", label: "Landscape 4:3", width: 4, height: 3 },
  { value: "landscape_16_9", label: "Widescreen 16:9", width: 16, height: 9 },
]

const commonRatios: ImageDimensionOption[] = [
  { value: "1:1", label: "Square 1:1", width: 1, height: 1 },
  { value: "4:3", label: "Landscape 4:3", width: 4, height: 3 },
  { value: "3:4", label: "Portrait 3:4", width: 3, height: 4 },
  { value: "16:9", label: "Widescreen 16:9", width: 16, height: 9 },
  { value: "9:16", label: "Portrait 9:16", width: 9, height: 16 },
  { value: "3:2", label: "Landscape 3:2", width: 3, height: 2 },
  { value: "2:3", label: "Portrait 2:3", width: 2, height: 3 },
  { value: "5:4", label: "Landscape 5:4", width: 5, height: 4 },
  { value: "4:5", label: "Portrait 4:5", width: 4, height: 5 },
  { value: "21:9", label: "Cinematic 21:9", width: 21, height: 9 },
]

const extendedRatios: ImageDimensionOption[] = [
  { value: "auto", label: "Auto", width: 1, height: 1 },
  ...commonRatios,
  { value: "4:1", label: "Panorama 4:1", width: 4, height: 1 },
  { value: "1:4", label: "Vertical 1:4", width: 1, height: 4 },
]

const reveRatios: ImageDimensionOption[] = [
  ...extendedRatios,
  { value: "3:1", label: "Panorama 3:1", width: 3, height: 1 },
  { value: "2:1", label: "Wide 2:1", width: 2, height: 1 },
  { value: "17:9", label: "Cinema 17:9", width: 17, height: 9 },
  { value: "1:2", label: "Tall 1:2", width: 1, height: 2 },
  { value: "1:3", label: "Vertical 1:3", width: 1, height: 3 },
]

const exactGptSizes: ImageDimensionOption[] = [
  { value: "1024x1024", label: "Square 1024", width: 1, height: 1 },
  { value: "1536x1024", label: "Landscape 1536", width: 3, height: 2 },
  { value: "1024x1536", label: "Portrait 1536", width: 2, height: 3 },
]

const outputFormats: ImageOutputFormat[] = ["png", "jpeg", "webp"]
const singleImageMultiplicity: ImageMultiplicity = {
  kind: "imagesPerRequest",
  parameter: "num_images",
  providerMin: 1,
  providerMax: 1,
  appMax: 1,
  default: 1,
  sendParameter: false,
}

const fourImageMultiplicity: ImageMultiplicity = {
  kind: "imagesPerRequest",
  parameter: "num_images",
  providerMin: 1,
  providerMax: 4,
  appMax: IMAGE_STUDIO_APP_MAX_OUTPUTS,
  default: 1,
  sendParameter: true,
}

const seedreamMultiplicity: ImageMultiplicity = {
  kind: "generationsWithVariableImages",
  generationParameter: "num_images",
  generationMin: 1,
  generationMax: 6,
  maxImagesParameter: "max_images",
  maxImagesMin: 1,
  maxImagesMax: 6,
  appMaxTotalOutputs: IMAGE_STUDIO_APP_MAX_OUTPUTS,
  defaultGenerations: 1,
  defaultMaxImages: 1,
}

function buildFalCapability(
  modelId: string,
  overrides: Partial<Omit<ImageModelCapability, "modelId" | "provider">> = {}
): ImageModelCapability {
  return {
    schemaVersion: IMAGE_CAPABILITY_SCHEMA_VERSION,
    revision: `fal:${modelId}:v1`,
    provider: "fal",
    modelId,
    modes: ["textToImage", "imageToImage"],
    dimensions: {
      parameter: "image_size",
      options: squareAndOrientationSizes,
      default: "square_hd",
    },
    multiplicity: singleImageMultiplicity,
    references: { max: 1 },
    options: {
      defaultOutputFormat: "png",
      outputFormats: ["png"],
    },
    pricing: { kind: "unknown", currency: "USD" },
    ...overrides,
  }
}

const fluxOptions: ImageModelCapability["options"] = {
  defaultOutputFormat: "png",
  outputFormats,
  outputFormatParameter: true,
  promptExpansion: true,
  seed: true,
}

const falCapabilities: ImageModelCapability[] = [
  buildFalCapability("fal-ai/flux-2/klein/4b", {
    multiplicity: { ...singleImageMultiplicity, sendParameter: true },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2/klein/9b", {
    multiplicity: fourImageMultiplicity,
    references: { max: 4 },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2", {
    multiplicity: { ...singleImageMultiplicity, sendParameter: true },
    references: { max: 4 },
    dimensions: {
      parameter: "image_size",
      options: squareAndOrientationSizes,
      default: "landscape_4_3",
    },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2/flash", {
    multiplicity: fourImageMultiplicity,
    references: { max: 4 },
    dimensions: {
      parameter: "image_size",
      options: squareAndOrientationSizes,
      default: "landscape_4_3",
    },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2/turbo", {
    multiplicity: fourImageMultiplicity,
    references: { max: 4 },
    dimensions: {
      parameter: "image_size",
      options: squareAndOrientationSizes,
      default: "landscape_4_3",
    },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2-flex", {
    multiplicity: { ...singleImageMultiplicity, sendParameter: true },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2-pro", {
    multiplicity: { ...singleImageMultiplicity, sendParameter: true },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-2-max", {
    multiplicity: fourImageMultiplicity,
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: fluxOptions,
  }),
  buildFalCapability("fal-ai/flux-pro/kontext/text-to-image", {
    references: { max: 1 },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      seed: true,
    },
  }),
  buildFalCapability("google/nano-banana-lite", {
    dimensions: {
      parameter: "aspect_ratio",
      options: [
        ...extendedRatios,
        { value: "8:1", label: "Ultra-wide 8:1", width: 8, height: 1 },
        { value: "1:8", label: "Ultra-tall 1:8", width: 1, height: 8 },
      ],
      default: "auto",
    },
    multiplicity: fourImageMultiplicity,
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      seed: true,
    },
  }),
  buildFalCapability("fal-ai/nano-banana-2", {
    dimensions: {
      parameter: "aspect_ratio",
      options: [
        { value: "auto", label: "Auto", width: 1, height: 1 },
        ...commonRatios,
      ],
      default: "auto",
    },
    resolutions: {
      parameter: "resolution",
      options: [
        { value: "1K", label: "1K" },
        { value: "2K", label: "2K" },
        { value: "4K", label: "4K" },
      ],
      default: "1K",
    },
    multiplicity: {
      kind: "imagesPerRequest",
      parameter: "num_images",
      providerMin: 1,
      providerMax: 4,
      appMax: IMAGE_STUDIO_APP_MAX_OUTPUTS,
      default: 1,
      sendParameter: true,
    },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      seed: true,
    },
  }),
  buildFalCapability("fal-ai/nano-banana-pro", {
    dimensions: {
      parameter: "aspect_ratio",
      options: [
        { value: "auto", label: "Auto", width: 1, height: 1 },
        ...commonRatios,
      ],
      default: "auto",
    },
    resolutions: {
      parameter: "resolution",
      options: [
        { value: "1K", label: "1K" },
        { value: "2K", label: "2K" },
        { value: "4K", label: "4K" },
      ],
      default: "2K",
    },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      seed: true,
    },
  }),
  buildFalCapability("fal-ai/gpt-image-1.5", {
    dimensions: {
      parameter: "image_size",
      options: exactGptSizes,
      default: "1024x1024",
    },
    multiplicity: {
      kind: "imagesPerRequest",
      parameter: "num_images",
      providerMin: 1,
      providerMax: 4,
      appMax: IMAGE_STUDIO_APP_MAX_OUTPUTS,
      default: 1,
      sendParameter: true,
    },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      backgrounds: [
        { value: "auto", label: "Automatic" },
        { value: "opaque", label: "Opaque" },
        { value: "transparent", label: "Transparent" },
      ],
      defaultBackground: "auto",
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      qualities: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultQuality: "high",
    },
  }),
  buildFalCapability("openai/gpt-image-2", {
    dimensions: {
      parameter: "image_size",
      options: exactGptSizes,
      default: "1024x1024",
    },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      backgrounds: [
        { value: "auto", label: "Automatic" },
        { value: "opaque", label: "Opaque" },
        { value: "transparent", label: "Transparent" },
      ],
      defaultBackground: "auto",
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      qualities: [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
      ],
      defaultQuality: "high",
    },
  }),
  buildFalCapability("fal-ai/recraft/v3/text-to-image", {
    references: { max: 1 },
    options: {
      defaultOutputFormat: "png",
      outputFormats: ["png"],
      styles: [
        { value: "realistic_image", label: "Realistic" },
        { value: "digital_illustration", label: "Digital illustration" },
        { value: "vector_illustration", label: "Vector illustration" },
      ],
      defaultStyle: "realistic_image",
    },
  }),
  buildFalCapability("fal-ai/ideogram/v3", {
    multiplicity: { ...singleImageMultiplicity, sendParameter: true },
    references: { max: 1 },
    options: {
      defaultOutputFormat: "png",
      outputFormats: ["png"],
      seed: true,
    },
  }),
  buildFalCapability("ideogram/v4", {
    multiplicity: fourImageMultiplicity,
    references: { max: 1 },
    options: {
      defaultOutputFormat: "jpeg",
      outputFormats: ["jpeg", "png"],
      outputFormatParameter: true,
      seed: true,
    },
  }),
  buildFalCapability("fal-ai/qwen-image-2/text-to-image", {
    multiplicity: fourImageMultiplicity,
    references: { max: 3 },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      promptExpansion: true,
      seed: true,
    },
  }),
  buildFalCapability("fal-ai/qwen-image-2/pro/text-to-image", {
    multiplicity: fourImageMultiplicity,
    references: { max: 3 },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
      promptExpansion: true,
      seed: true,
    },
  }),
  buildFalCapability("fal-ai/bytedance/seedream/v4.5/text-to-image", {
    dimensions: {
      parameter: "image_size",
      options: [
        ...squareAndOrientationSizes,
        { value: "auto_2K", label: "Automatic 2K", width: 1, height: 1 },
        { value: "auto_4K", label: "Automatic 4K", width: 1, height: 1 },
      ],
      default: "auto_2K",
    },
    multiplicity: seedreamMultiplicity,
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "png",
      outputFormats: ["png"],
      seed: true,
    },
  }),
  buildFalCapability("bytedance/seedream/v5/lite/text-to-image", {
    dimensions: {
      parameter: "image_size",
      options: [
        ...squareAndOrientationSizes,
        { value: "auto_2K", label: "Automatic 2K", width: 1, height: 1 },
        { value: "auto_3K", label: "Automatic 3K", width: 1, height: 1 },
      ],
      default: "auto_2K",
    },
    multiplicity: seedreamMultiplicity,
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "png",
      outputFormats: ["png"],
      seed: true,
    },
  }),
  buildFalCapability("bytedance/seedream/v5/pro/text-to-image", {
    dimensions: {
      parameter: "image_size",
      options: [
        { value: "auto_1K", label: "Automatic 1K", width: 1, height: 1 },
        { value: "auto_2K", label: "Automatic 2K", width: 1, height: 1 },
      ],
      default: "auto_2K",
    },
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "jpeg",
      outputFormats: ["jpeg", "png"],
      outputFormatParameter: true,
      seed: true,
    },
  }),
  buildFalCapability("reve/2.1/text-to-image", {
    dimensions: {
      parameter: "aspect_ratio",
      options: reveRatios,
      default: "auto",
    },
    multiplicity: fourImageMultiplicity,
    references: { max: IMAGE_STUDIO_MAX_REFERENCES },
    options: {
      defaultOutputFormat: "png",
      outputFormats,
      outputFormatParameter: true,
    },
  }),
  buildFalCapability("xai/grok-imagine-image", {
    multiplicity: {
      kind: "imagesPerRequest",
      parameter: "num_images",
      providerMin: 1,
      providerMax: 4,
      appMax: IMAGE_STUDIO_APP_MAX_OUTPUTS,
      default: 1,
      sendParameter: true,
    },
    dimensions: {
      parameter: "aspect_ratio",
      options: [
        { value: "1:1", label: "Square 1:1", width: 1, height: 1 },
        { value: "4:3", label: "Landscape 4:3", width: 4, height: 3 },
        { value: "3:4", label: "Portrait 3:4", width: 3, height: 4 },
        { value: "16:9", label: "Widescreen 16:9", width: 16, height: 9 },
        { value: "9:16", label: "Portrait 9:16", width: 9, height: 16 },
        { value: "2:1", label: "Wide 2:1", width: 2, height: 1 },
        { value: "1:2", label: "Tall 1:2", width: 1, height: 2 },
      ],
      default: "1:1",
    },
    resolutions: {
      parameter: "resolution",
      options: [
        { value: "1k", label: "1K" },
        { value: "2k", label: "2K" },
      ],
      default: "1k",
    },
    references: { max: 3 },
    options: {
      defaultOutputFormat: "jpeg",
      outputFormats,
      outputFormatParameter: true,
    },
  }),
]

const falCapabilitiesByModel = new Map(
  falCapabilities.map((capability) => [capability.modelId, capability])
)

export function getStaticImageModelCapability(
  provider: ImageProvider,
  modelId: string
) {
  if (provider === "fal") return falCapabilitiesByModel.get(modelId) ?? null
  return null
}

export function getDefaultImageGenerationConfig(
  capability: ImageModelCapability
): ImageGenerationConfig {
  const multiplicity = capability.multiplicity
  return {
    dimension: capability.dimensions.default,
    ...(capability.resolutions
      ? { resolution: capability.resolutions.default }
      : {}),
    count:
      multiplicity.kind === "imagesPerRequest"
        ? multiplicity.default
        : multiplicity.defaultGenerations,
    ...(multiplicity.kind === "generationsWithVariableImages"
      ? { maxImages: multiplicity.defaultMaxImages }
      : {}),
    outputFormat: capability.options.defaultOutputFormat,
    ...(capability.options.defaultQuality
      ? { quality: capability.options.defaultQuality }
      : {}),
    ...(capability.options.defaultBackground
      ? { background: capability.options.defaultBackground }
      : {}),
    ...(capability.options.defaultStyle
      ? { style: capability.options.defaultStyle }
      : {}),
    ...(capability.options.promptExpansion ? { promptExpansion: false } : {}),
  }
}

function includesOption(options: ImageSelectOption[], value: string) {
  return options.some((option) => option.value === value)
}

export function validateImageGenerationConfig(
  capability: ImageModelCapability,
  requested: ImageGenerationConfig
): ImageGenerationConfig {
  if (!includesOption(capability.dimensions.options, requested.dimension))
    throw new Error("The selected image size is unavailable for this model")

  const multiplicity = capability.multiplicity
  if (!Number.isSafeInteger(requested.count))
    throw new Error("The requested image count is invalid")

  if (multiplicity.kind === "imagesPerRequest") {
    if (
      requested.count < multiplicity.providerMin ||
      requested.count > multiplicity.providerMax ||
      requested.count > multiplicity.appMax
    )
      throw new Error("The requested image count is unavailable for this model")
  } else {
    const maxImages = requested.maxImages ?? multiplicity.defaultMaxImages
    if (
      requested.count < multiplicity.generationMin ||
      requested.count > multiplicity.generationMax ||
      !Number.isSafeInteger(maxImages) ||
      maxImages < multiplicity.maxImagesMin ||
      maxImages > multiplicity.maxImagesMax ||
      requested.count * maxImages > multiplicity.appMaxTotalOutputs
    )
      throw new Error("The requested generation range is unavailable")
  }

  if (!capability.options.outputFormats.includes(requested.outputFormat))
    throw new Error("The selected output format is unavailable for this model")
  if (
    requested.resolution !== undefined &&
    (!capability.resolutions ||
      !includesOption(capability.resolutions.options, requested.resolution))
  )
    throw new Error("The selected resolution is unavailable for this model")
  if (
    requested.quality !== undefined &&
    (!capability.options.qualities ||
      !includesOption(capability.options.qualities, requested.quality))
  )
    throw new Error("The selected quality is unavailable for this model")
  if (
    requested.background !== undefined &&
    (!capability.options.backgrounds ||
      !includesOption(capability.options.backgrounds, requested.background))
  )
    throw new Error("The selected background is unavailable for this model")
  if (
    requested.style !== undefined &&
    (!capability.options.styles ||
      !includesOption(capability.options.styles, requested.style))
  )
    throw new Error("The selected style is unavailable for this model")
  if (
    requested.seed !== undefined &&
    (!capability.options.seed ||
      !Number.isSafeInteger(requested.seed) ||
      requested.seed < 0 ||
      requested.seed > 4_294_967_295)
  )
    throw new Error("The selected seed is unavailable for this model")
  if (requested.promptExpansion && !capability.options.promptExpansion)
    throw new Error("Prompt expansion is unavailable for this model")
  if (
    requested.background === "transparent" &&
    requested.outputFormat === "jpeg"
  )
    throw new Error("Transparent images require PNG or WebP output")

  return {
    ...requested,
    ...(multiplicity.kind === "generationsWithVariableImages"
      ? { maxImages: requested.maxImages ?? multiplicity.defaultMaxImages }
      : { maxImages: undefined }),
  }
}

export function getImageOutputRange(
  capability: ImageModelCapability,
  config: ImageGenerationConfig
) {
  if (capability.multiplicity.kind === "imagesPerRequest")
    return { minimum: config.count, maximum: config.count }
  const maxImages = config.maxImages ?? capability.multiplicity.defaultMaxImages
  return { minimum: config.count, maximum: config.count * maxImages }
}
