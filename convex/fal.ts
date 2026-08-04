import { MAX_ATTACHMENT_BYTES } from "./attachmentPolicy"

const FAL_MODELS_URL = "https://api.fal.ai/v1/models"
const FAL_PRICING_URL = "https://api.fal.ai/v1/models/pricing"
const FAL_QUEUE_ORIGIN = "https://queue.fal.run"
const FAL_REQUEST_TIMEOUT_MS = 15_000
const FAL_GENERATION_TIMEOUT_MS = 5 * 60 * 1000
const FAL_POLL_INTERVAL_MS = 1_000
const FAL_MAX_REFERENCES = 10
const GENERATED_IMAGE_EXTENSIONS = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
])

type FalModelConfig = {
  description: string
  editEndpoint: string
  editInput: "image_url" | "image_urls"
  id: string
}

export const FAL_IMAGE_MODELS = [
  {
    id: "fal-ai/flux-2/klein/4b",
    editEndpoint: "fal-ai/flux-2/klein/4b/edit",
    editInput: "image_urls",
    description: "Fast, low-cost generation with strong prompt adherence",
  },
  {
    id: "fal-ai/flux-2-pro",
    editEndpoint: "fal-ai/flux-2-pro/edit",
    editInput: "image_urls",
    description: "Professional general-purpose generation and editing",
  },
  {
    id: "fal-ai/nano-banana-2",
    editEndpoint: "fal-ai/nano-banana-2/edit",
    editInput: "image_urls",
    description: "Fast, high-fidelity generation with multimodal editing",
  },
  {
    id: "fal-ai/recraft/v3/text-to-image",
    editEndpoint: "fal-ai/recraft/v3/image-to-image",
    editInput: "image_url",
    description: "Brand, typography, illustration, and design work",
  },
  {
    id: "bytedance/seedream/v5/pro/text-to-image",
    editEndpoint: "bytedance/seedream/v5/pro/edit",
    editInput: "image_urls",
    description: "Flagship quality for dense layouts and multilingual text",
  },
] as const satisfies readonly FalModelConfig[]

const falModelsById: ReadonlyMap<string, (typeof FAL_IMAGE_MODELS)[number]> =
  new Map(FAL_IMAGE_MODELS.map((model) => [model.id, model]))

type FalCatalogModel = {
  description: string
  label: string
  outputMode: "image"
  provider: "fal"
  value: string
}

type Fetcher = typeof fetch

export class FalApiError extends Error {
  constructor(readonly statusCode: number) {
    super("Fal API request failed")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function buildFalPlatformUrl(base: string) {
  const url = new URL(base)
  for (const model of FAL_IMAGE_MODELS) {
    url.searchParams.append("endpoint_id", model.id)
  }
  return url.toString()
}

function formatPrice(value: number, unit: string) {
  const price = value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")
  return `$${price} / ${unit.replaceAll("_", " ")}`
}

export function parseFalImageModels(
  catalogValue: unknown,
  pricingValue: unknown
): FalCatalogModel[] {
  if (!isRecord(catalogValue) || !Array.isArray(catalogValue.models)) {
    throw new Error("Fal returned an invalid model catalog")
  }

  const catalog = new Map<string, Record<string, unknown>>()
  for (const model of catalogValue.models) {
    if (!isRecord(model) || typeof model.endpoint_id !== "string") continue
    if (!falModelsById.has(model.endpoint_id) || !isRecord(model.metadata))
      continue
    if (
      model.metadata.status !== "active" ||
      model.metadata.category !== "text-to-image"
    )
      continue
    catalog.set(model.endpoint_id, model.metadata)
  }

  const prices = new Map<string, { unit: string; value: number }>()
  if (isRecord(pricingValue) && Array.isArray(pricingValue.prices)) {
    for (const price of pricingValue.prices) {
      if (
        !isRecord(price) ||
        typeof price.endpoint_id !== "string" ||
        !falModelsById.has(price.endpoint_id) ||
        typeof price.unit_price !== "number" ||
        !Number.isFinite(price.unit_price) ||
        price.unit_price < 0 ||
        typeof price.unit !== "string" ||
        !price.unit ||
        price.unit.length > 40 ||
        price.currency !== "USD"
      )
        continue
      prices.set(price.endpoint_id, {
        unit: price.unit,
        value: price.unit_price,
      })
    }
  }

  return FAL_IMAGE_MODELS.flatMap((model) => {
    const metadata = catalog.get(model.id)
    if (!metadata) return []
    const label = metadata.display_name
    if (typeof label !== "string" || !label || label.length > 200) return []
    const price = prices.get(model.id)
    return [
      {
        provider: "fal" as const,
        value: model.id,
        label,
        outputMode: "image" as const,
        description: [
          model.description,
          price ? formatPrice(price.value, price.unit) : undefined,
        ]
          .filter(Boolean)
          .join(" - "),
      },
    ]
  })
}

export async function loadFalImageModels(
  token: string,
  fetcher: Fetcher = fetch
): Promise<FalCatalogModel[]> {
  const headers = { Authorization: `Key ${token}` }
  const [catalogResponse, pricingResponse] = await Promise.all([
    fetcher(buildFalPlatformUrl(FAL_MODELS_URL), {
      headers,
      signal: AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
    }),
    fetcher(buildFalPlatformUrl(FAL_PRICING_URL), {
      headers,
      signal: AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
    }),
  ])

  if (
    [catalogResponse.status, pricingResponse.status].some(
      (status) => status === 401 || status === 403
    )
  )
    throw new FalApiError(401)
  if (!catalogResponse.ok) throw new FalApiError(catalogResponse.status)

  const models = parseFalImageModels(
    await readJson(catalogResponse),
    pricingResponse.ok ? await readJson(pricingResponse) : null
  )
  if (!models.length) throw new Error("No supported Fal image models available")
  return models
}

export function buildFalImageRequest(
  modelId: string,
  prompt: string,
  referenceUrls: string[]
) {
  const model = falModelsById.get(modelId)
  if (!model) throw new Error("Fal model is unavailable")
  if (referenceUrls.length > FAL_MAX_REFERENCES)
    throw new Error("Fal supports at most 10 reference images")
  if (model.editInput === "image_url" && referenceUrls.length > 1) {
    throw new Error("This Fal model supports one reference image")
  }
  if (!referenceUrls.length) return { endpoint: model.id, input: { prompt } }
  return {
    endpoint: model.editEndpoint,
    input:
      model.editInput === "image_url"
        ? { prompt, image_url: referenceUrls[0] }
        : { prompt, image_urls: referenceUrls },
  }
}

function parseQueueUrl(
  value: unknown,
  endpoint: string,
  requestId: string,
  suffix: "response" | "status"
) {
  if (typeof value !== "string")
    throw new Error("Fal returned an invalid queue URL")
  const url = new URL(value)
  const expectedPath = `/${endpoint}/requests/${requestId}/${suffix}`
  if (
    url.origin !== FAL_QUEUE_ORIGIN ||
    url.pathname !== expectedPath ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error("Fal returned an invalid queue URL")
  return url.toString()
}

function parseFalResult(value: unknown) {
  const image =
    isRecord(value) && Array.isArray(value.images) && isRecord(value.images[0])
      ? value.images[0]
      : null
  if (!image || typeof image.url !== "string")
    throw new Error("Fal returned an invalid image")
  return image.url
}

function isTrustedFalMediaUrl(value: string) {
  const url = new URL(value)
  if (url.protocol !== "https:" || url.username || url.password) return false
  if (url.hostname === "fal.media" || url.hostname.endsWith(".fal.media"))
    return true
  return (
    url.hostname === "storage.googleapis.com" &&
    url.pathname.startsWith("/falserverless/")
  )
}

async function readBoundedImage(response: Response) {
  if (!response.body) throw new Error("Fal returned an invalid image")
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > MAX_ATTACHMENT_BYTES) {
        await reader.cancel()
        throw new Error("Fal returned an image that is too large")
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (!size) throw new Error("Fal returned an invalid image")
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function downloadFalImage(imageUrl: string, fetcher: Fetcher) {
  let url = imageUrl
  for (let redirect = 0; redirect < 4; redirect += 1) {
    if (!isTrustedFalMediaUrl(url))
      throw new Error("Fal returned an invalid image URL")
    const response = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location")
      if (!location) throw new Error("Fal image download failed")
      url = new URL(location, url).toString()
      continue
    }
    if (!response.ok) throw new FalApiError(response.status)
    const declaredSize = Number(response.headers.get("content-length"))
    if (Number.isFinite(declaredSize) && declaredSize > MAX_ATTACHMENT_BYTES)
      throw new Error("Fal returned an image that is too large")
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]
    const extension = contentType
      ? GENERATED_IMAGE_EXTENSIONS.get(contentType)
      : undefined
    if (!contentType || !extension)
      throw new Error("Fal returned an invalid image")
    const bytes = await readBoundedImage(response)
    return { bytes, contentType, extension }
  }
  throw new Error("Fal image download redirected too many times")
}

export async function generateFalImage(
  token: string,
  options: {
    model: string
    prompt: string
    referenceUrls: string[]
  },
  dependencies: {
    fetcher?: Fetcher
    now?: () => number
    wait?: (milliseconds: number) => Promise<void>
  } = {}
) {
  const fetcher = dependencies.fetcher ?? fetch
  const now = dependencies.now ?? Date.now
  const wait =
    dependencies.wait ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)))
  const request = buildFalImageRequest(
    options.model,
    options.prompt,
    options.referenceUrls
  )
  const headers = {
    Authorization: `Key ${token}`,
    "Content-Type": "application/json",
  }
  const submitResponse = await fetcher(
    `${FAL_QUEUE_ORIGIN}/${request.endpoint}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(request.input),
      signal: AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
    }
  )
  const submission = await readJson(submitResponse)
  if (!submitResponse.ok) throw new FalApiError(submitResponse.status)
  if (
    !isRecord(submission) ||
    typeof submission.request_id !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(submission.request_id)
  )
    throw new Error("Fal returned an invalid queue response")
  const statusUrl = parseQueueUrl(
    submission.status_url,
    request.endpoint,
    submission.request_id,
    "status"
  )
  const responseUrl = parseQueueUrl(
    submission.response_url,
    request.endpoint,
    submission.request_id,
    "response"
  )
  const deadline = now() + FAL_GENERATION_TIMEOUT_MS

  for (;;) {
    if (now() >= deadline) throw new Error("Fal image generation timed out")
    const statusResponse = await fetcher(statusUrl, {
      headers: { Authorization: headers.Authorization },
      signal: AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
    })
    const status = await readJson(statusResponse)
    if (!statusResponse.ok) throw new FalApiError(statusResponse.status)
    if (!isRecord(status) || typeof status.status !== "string")
      throw new Error("Fal returned an invalid queue status")
    if (status.status === "COMPLETED") {
      if (typeof status.error === "string" && status.error)
        throw new Error("Fal image generation failed")
      break
    }
    if (status.status !== "IN_QUEUE" && status.status !== "IN_PROGRESS")
      throw new Error("Fal returned an invalid queue status")
    await wait(FAL_POLL_INTERVAL_MS)
  }

  const resultResponse = await fetcher(responseUrl, {
    headers: { Authorization: headers.Authorization },
    signal: AbortSignal.timeout(FAL_REQUEST_TIMEOUT_MS),
  })
  const result = await readJson(resultResponse)
  if (!resultResponse.ok) throw new FalApiError(resultResponse.status)
  return await downloadFalImage(parseFalResult(result), fetcher)
}
