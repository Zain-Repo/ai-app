import { v } from "convex/values"

import { internal } from "./_generated/api"
import { action, env } from "./_generated/server"
import { imageModelCapabilityValidator } from "./imageGenerationPolicy"
import { readBoundedJson } from "./boundedJson"
import { decryptProviderToken } from "./providerCrypto"
import {
  IMAGE_CAPABILITY_SCHEMA_VERSION,
  IMAGE_STUDIO_APP_MAX_OUTPUTS,
  IMAGE_STUDIO_MAX_REFERENCES,
  getStaticImageModelCapability,
} from "../shared/image-generation"
import type {
  ImageDimensionOption,
  ImageModelCapability,
  ImageOutputFormat,
  ImageSelectOption,
} from "../shared/image-generation"

const OPENROUTER_IMAGE_MODELS_URL = "https://openrouter.ai/api/v1/images/models"
const REQUEST_TIMEOUT_MS = 15_000
const CAPABILITY_RESPONSE_MAX_BYTES = 2 * 1024 * 1024
const ALLOWED_FORMATS = new Set<ImageOutputFormat>(["jpeg", "png", "webp"])

type ParameterDescriptor =
  | { type: "boolean" }
  | { type: "enum"; values: string[] }
  | { type: "range"; min: number; max: number }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function getImageModelEndpointsUrl(model: string) {
  const parts = model.split("/")
  if (
    parts.length !== 2 ||
    parts.some((part) => !/^[A-Za-z0-9._-]+$/.test(part))
  )
    throw new Error("Image model is unavailable")
  return `${OPENROUTER_IMAGE_MODELS_URL}/${parts
    .map(encodeURIComponent)
    .join("/")}/endpoints`
}

function parseDescriptor(value: unknown): ParameterDescriptor | null {
  if (!isRecord(value) || typeof value.type !== "string") return null
  if (value.type === "boolean") return { type: "boolean" }
  if (
    value.type === "enum" &&
    Array.isArray(value.values) &&
    value.values.every((item) => typeof item === "string")
  )
    return { type: "enum", values: value.values.slice(0, 50) }
  if (
    value.type === "range" &&
    typeof value.min === "number" &&
    Number.isFinite(value.min) &&
    typeof value.max === "number" &&
    Number.isFinite(value.max) &&
    value.max >= value.min
  )
    return { type: "range", min: value.min, max: value.max }
  return null
}

function parseSupportedParameters(value: unknown) {
  const descriptors = new Map<string, ParameterDescriptor>()
  if (!isRecord(value)) return descriptors
  for (const [key, descriptor] of Object.entries(value)) {
    const parsed = parseDescriptor(descriptor)
    if (parsed) descriptors.set(key, parsed)
  }
  return descriptors
}

function getEndpointRows(value: unknown): Record<string, unknown>[] {
  if (!isRecord(value)) return []
  const data = value.data
  if (Array.isArray(data)) return data.filter(isRecord)
  if (isRecord(data) && Array.isArray(data.endpoints))
    return data.endpoints.filter(isRecord)
  if (Array.isArray(value.endpoints)) return value.endpoints.filter(isRecord)
  return []
}

function intersectDescriptors(
  descriptors: Array<Map<string, ParameterDescriptor>>
) {
  const result = new Map<string, ParameterDescriptor>()
  const first = descriptors.at(0)
  if (!first) return result
  for (const [key, descriptor] of first) {
    const candidates = descriptors.map((item) => item.get(key))
    if (candidates.some((item) => !item)) continue
    const availableCandidates = candidates.filter(
      (candidate): candidate is ParameterDescriptor => Boolean(candidate)
    )
    if (descriptor.type === "enum") {
      const enumCandidates = availableCandidates.filter(
        (
          candidate
        ): candidate is Extract<ParameterDescriptor, { type: "enum" }> =>
          candidate.type === "enum"
      )
      if (enumCandidates.length !== availableCandidates.length) continue
      const values = descriptor.values.filter((value) =>
        enumCandidates.every((candidate) => candidate.values.includes(value))
      )
      if (values.length) result.set(key, { type: "enum", values })
      continue
    }
    if (descriptor.type === "range") {
      const ranges = availableCandidates.filter(
        (
          candidate
        ): candidate is Extract<ParameterDescriptor, { type: "range" }> =>
          candidate.type === "range"
      )
      if (ranges.length !== availableCandidates.length) continue
      const min = Math.max(...ranges.map((item) => item.min))
      const max = Math.min(...ranges.map((item) => item.max))
      if (max >= min) result.set(key, { type: "range", min, max })
      continue
    }
    if (availableCandidates.every((item) => item.type === "boolean"))
      result.set(key, descriptor)
  }
  return result
}

function parseRatio(value: string) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(value)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : null
}

function parsePixels(value: string) {
  const match = /^(\d+)x(\d+)$/i.exec(value)
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : null
}

function formatDimension(value: string): ImageDimensionOption {
  const dimensions = parseRatio(value) ?? parsePixels(value)
  const width = dimensions?.width ?? 1
  const height = dimensions?.height ?? 1
  const orientation =
    width === height ? "Square" : width > height ? "Landscape" : "Portrait"
  return {
    value,
    label: value === "auto" ? "Automatic" : `${orientation} ${value}`,
    width,
    height,
  }
}

function enumOptions(
  descriptor: ParameterDescriptor | undefined
): ImageSelectOption[] {
  return descriptor?.type === "enum"
    ? descriptor.values.map((value) => ({ value, label: value }))
    : []
}

function getOutputFormats(descriptor: ParameterDescriptor | undefined) {
  if (descriptor?.type !== "enum") return ["png"] as ImageOutputFormat[]
  const formats = descriptor.values.filter(
    (value): value is ImageOutputFormat =>
      ALLOWED_FORMATS.has(value as ImageOutputFormat)
  )
  if (!formats.length)
    throw new Error("This endpoint does not provide a supported raster format")
  return formats
}

function getCommonOutputFormats(
  descriptors: Array<Map<string, ParameterDescriptor>>
) {
  const formatsByEndpoint = descriptors.map((descriptorMap) =>
    getOutputFormats(descriptorMap.get("output_format"))
  )
  const first = formatsByEndpoint.at(0) ?? []
  const common = first.filter((format) =>
    formatsByEndpoint.every((formats) => formats.includes(format))
  )
  if (!common.length)
    throw new Error("Automatic routing has no common raster output format")
  return common
}

function getCommonCountRange(
  descriptors: Array<Map<string, ParameterDescriptor>>
) {
  const ranges = descriptors.map((descriptorMap) => {
    const descriptor = descriptorMap.get("n")
    return descriptor?.type === "range"
      ? {
          min: Math.max(1, Math.ceil(descriptor.min)),
          max: Math.min(10, Math.floor(descriptor.max)),
        }
      : { min: 1, max: 1 }
  })
  const providerMin = Math.max(...ranges.map((range) => range.min))
  const providerMax = Math.min(...ranges.map((range) => range.max))
  if (providerMax < providerMin)
    throw new Error("Automatic routing has no common output count")
  if (providerMin > IMAGE_STUDIO_APP_MAX_OUTPUTS)
    throw new Error("This endpoint requires too many outputs per request")
  return { providerMin, providerMax }
}

function getReferenceMaximum(descriptor: ParameterDescriptor | undefined) {
  if (descriptor?.type === "range")
    return Math.min(
      IMAGE_STUDIO_MAX_REFERENCES,
      Math.max(0, Math.floor(descriptor.max))
    )
  return descriptor ? 1 : 0
}

function hashRevision(value: unknown) {
  const serialized = JSON.stringify(value)
  let hash = 2_166_136_261
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

function parsePricing(endpoints: Record<string, unknown>[]) {
  const prices = endpoints.flatMap((endpoint) => {
    if (!Array.isArray(endpoint.pricing)) return []
    return endpoint.pricing.flatMap((line) =>
      isRecord(line) &&
      line.billable === "output_image" &&
      line.unit === "image" &&
      typeof line.cost_usd === "number" &&
      Number.isFinite(line.cost_usd) &&
      line.cost_usd >= 0
        ? [line.cost_usd]
        : []
    )
  })
  if (!prices.length)
    return { kind: "unknown" as const, currency: "USD" as const }
  const minimum = Math.min(...prices)
  const maximum = Math.max(...prices)
  if (minimum === maximum)
    return {
      kind: "exact" as const,
      currency: "USD" as const,
      display: `$${minimum.toFixed(minimum < 0.01 ? 4 : 2)} per image`,
    }
  return {
    kind: "range" as const,
    currency: "USD" as const,
    display: `$${minimum.toFixed(minimum < 0.01 ? 4 : 2)}–$${maximum.toFixed(
      maximum < 0.01 ? 4 : 2
    )} per image`,
  }
}

export function parseOpenRouterImageCapability(
  value: unknown,
  modelId: string,
  routingProvider?: string
): ImageModelCapability {
  const allEndpoints = getEndpointRows(value)
  const endpoints =
    routingProvider && routingProvider !== "auto"
      ? allEndpoints.filter(
          (endpoint) => endpoint.provider_tag === routingProvider
        )
      : allEndpoints
  if (!endpoints.length)
    throw new Error("This model has no compatible image endpoint")

  const endpointDescriptors = endpoints.map((endpoint) =>
    parseSupportedParameters(endpoint.supported_parameters)
  )
  const supported = intersectDescriptors(endpointDescriptors)
  const dimensionEntry = (["aspect_ratio", "size"] as const)
    .map((parameter) => ({ parameter, descriptor: supported.get(parameter) }))
    .find(({ descriptor }) => descriptor?.type === "enum")
  const dimensionValues =
    dimensionEntry?.descriptor?.type === "enum"
      ? dimensionEntry.descriptor.values
      : ["auto"]
  const { providerMin, providerMax } = getCommonCountRange(endpointDescriptors)
  const outputFormats = getCommonOutputFormats(endpointDescriptors)
  const resolutions = enumOptions(supported.get("resolution"))
  const references = getReferenceMaximum(supported.get("input_references"))
  const qualityOptions = enumOptions(supported.get("quality"))
  const backgroundOptions = enumOptions(supported.get("background"))
  const normalizedSource = {
    endpoints: endpoints
      .map((endpoint) => ({
        provider_tag: endpoint.provider_tag,
        supported_parameters: endpoint.supported_parameters,
      }))
      .sort((left, right) =>
        String(left.provider_tag).localeCompare(String(right.provider_tag))
      ),
    modelId,
    routingProvider: routingProvider ?? "auto",
  }

  return {
    schemaVersion: IMAGE_CAPABILITY_SCHEMA_VERSION,
    revision: `openrouter:${hashRevision(normalizedSource)}`,
    provider: "openrouter",
    modelId,
    ...(routingProvider && routingProvider !== "auto"
      ? { endpoint: routingProvider }
      : {}),
    modes: references ? ["textToImage", "imageToImage"] : ["textToImage"],
    dimensions: {
      parameter: dimensionEntry?.parameter ?? "aspect_ratio",
      options: dimensionValues.map(formatDimension),
      default: dimensionValues.includes("auto") ? "auto" : dimensionValues[0],
      ...(dimensionEntry ? {} : { sendParameter: false }),
    },
    ...(resolutions.length
      ? {
          resolutions: {
            parameter: "resolution" as const,
            options: resolutions,
            default: resolutions[0].value,
          },
        }
      : {}),
    multiplicity: {
      kind: "imagesPerRequest",
      parameter: "n",
      providerMin,
      providerMax,
      appMax: Math.min(providerMax, IMAGE_STUDIO_APP_MAX_OUTPUTS),
      default: providerMin,
      sendParameter: supported.get("n")?.type === "range",
    },
    references: { max: references },
    options: {
      ...(backgroundOptions.length
        ? {
            backgrounds: backgroundOptions,
            defaultBackground: backgroundOptions[0].value,
          }
        : {}),
      defaultOutputFormat: outputFormats[0],
      outputFormats,
      outputFormatParameter: supported.has("output_format"),
      ...(qualityOptions.length
        ? {
            qualities: qualityOptions,
            defaultQuality: qualityOptions[0].value,
          }
        : {}),
      seed: supported.has("seed"),
    },
    pricing: parsePricing(endpoints),
  }
}

export async function loadOpenRouterImageCapability(
  token: string,
  modelId: string,
  routingProvider?: string
) {
  const result = await loadOpenRouterImageEndpoints(token, modelId)
  return parseOpenRouterImageCapability(result, modelId, routingProvider)
}

async function loadOpenRouterImageEndpoints(token: string, modelId: string) {
  const response = await fetch(getImageModelEndpointsUrl(modelId), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  const result = await readBoundedJson(
    response,
    CAPABILITY_RESPONSE_MAX_BYTES,
    "OpenRouter returned an oversized or invalid capability response"
  ).catch(() => null)
  if (!response.ok) {
    const error = new Error("Could not load image model capabilities")
    Object.assign(error, { statusCode: response.status })
    throw error
  }
  return result
}

export function parseOpenRouterImageRoutes(value: unknown, modelId: string) {
  const routes = new Map<
    string,
    { value: string; label: string; description: string }
  >()
  for (const endpoint of getEndpointRows(value)) {
    if (typeof endpoint.provider_tag !== "string" || !endpoint.provider_tag)
      continue
    try {
      const capability = parseOpenRouterImageCapability(
        value,
        modelId,
        endpoint.provider_tag
      )
      routes.set(endpoint.provider_tag, {
        value: endpoint.provider_tag,
        label:
          typeof endpoint.provider_name === "string" && endpoint.provider_name
            ? endpoint.provider_name
            : endpoint.provider_tag,
        description:
          capability.pricing.display ?? "Dedicated image generation endpoint",
      })
    } catch {
      // Routes that cannot satisfy the raster contract are intentionally hidden.
    }
  }
  return [...routes.values()].sort((left, right) =>
    left.label.localeCompare(right.label)
  )
}

export const get = action({
  args: {
    provider: v.union(
      v.literal("fal"),
      v.literal("openrouter"),
      v.literal("ai_gateway")
    ),
    model: v.string(),
    routingProvider: v.optional(v.string()),
  },
  returns: imageModelCapabilityValidator,
  handler: async (ctx, args) => {
    const credential =
      args.provider === "fal"
        ? await ctx.runQuery(
            internal.providerConnections.getProviderCredential,
            { provider: "fal" }
          )
        : await ctx.runQuery(
            internal.providerConnections.getProviderCredential,
            { provider: args.provider }
          )
    if (!credential) throw new Error("Provider not connected")

    if (args.provider === "fal") {
      const capability = getStaticImageModelCapability("fal", args.model)
      if (!capability) throw new Error("Image model is unavailable")
      return capability
    }
    if (args.provider === "ai_gateway") {
      const capability = getStaticImageModelCapability("ai_gateway", args.model)
      if (!capability) throw new Error("Image model is unavailable")
      return capability
    }

    const token = await decryptProviderToken(
      credential.ciphertext,
      credential.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY,
      "openrouter"
    )
    try {
      return await loadOpenRouterImageCapability(
        token,
        args.model,
        args.routingProvider
      )
    } catch (cause) {
      if (
        isRecord(cause) &&
        (cause.statusCode === 401 || cause.statusCode === 403)
      )
        await ctx.runMutation(
          internal.providerConnections.markOpenRouterNeedsAuthentication,
          {}
        )
      throw cause
    }
  },
})

export const listRoutes = action({
  args: { model: v.string() },
  returns: v.array(
    v.object({
      value: v.string(),
      label: v.string(),
      description: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const credential = await ctx.runQuery(
      internal.providerConnections.getOpenRouterCredential,
      {}
    )
    if (!credential) throw new Error("Provider not connected")
    const token = await decryptProviderToken(
      credential.ciphertext,
      credential.iv,
      env.PROVIDER_TOKEN_ENCRYPTION_KEY,
      "openrouter"
    )
    try {
      return parseOpenRouterImageRoutes(
        await loadOpenRouterImageEndpoints(token, args.model),
        args.model
      )
    } catch (cause) {
      if (
        isRecord(cause) &&
        (cause.statusCode === 401 || cause.statusCode === 403)
      )
        await ctx.runMutation(
          internal.providerConnections.markOpenRouterNeedsAuthentication,
          {}
        )
      throw cause
    }
  },
})
