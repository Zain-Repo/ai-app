export type AttachmentDescriptor = {
  contentType: string
  name: string
}

export type OpenRouterAttachmentKind =
  "audio" | "binary" | "image" | "pdf" | "text" | "video"

const PDF_MEDIA_TYPE = "application/pdf"
const DEFAULT_BINARY_MEDIA_TYPE = "application/octet-stream"

const TEXT_MEDIA_TYPES = new Set([
  "application/graphql",
  "application/javascript",
  "application/json",
  "application/ld+json",
  "application/sql",
  "application/toml",
  "application/typescript",
  "application/x-httpd-php",
  "application/x-javascript",
  "application/x-ndjson",
  "application/x-sh",
  "application/x-yaml",
  "application/xml",
  "application/yaml",
])

// Only extensions that are unambiguously text are decoded by the application.
// Unknown files remain binary so arbitrary uploads are never silently corrupted.
const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".bash",
  ".c",
  ".cc",
  ".cfg",
  ".cjs",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".cxx",
  ".env",
  ".fish",
  ".go",
  ".gql",
  ".graphql",
  ".h",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".kt",
  ".kts",
  ".log",
  ".markdown",
  ".md",
  ".mdx",
  ".mjs",
  ".ndjson",
  ".php",
  ".proto",
  ".ps1",
  ".py",
  ".rb",
  ".rs",
  ".rst",
  ".scala",
  ".sh",
  ".sql",
  ".svelte",
  ".swift",
  ".tex",
  ".toml",
  ".ts",
  ".tsv",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
])

const IMAGE_MEDIA_TYPES_BY_EXTENSION = new Map([
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
])
const IMAGE_MEDIA_TYPES = new Set(IMAGE_MEDIA_TYPES_BY_EXTENSION.values())

function normalizeMediaType(contentType: string) {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? ""
}

function getExtension(name: string) {
  const normalizedName = name.split(/[\\/]/).at(-1)?.trim().toLowerCase() ?? ""
  const extensionIndex = normalizedName.lastIndexOf(".")
  return extensionIndex >= 0 ? normalizedName.slice(extensionIndex) : ""
}

export function classifyOpenRouterAttachment({
  contentType,
  name,
}: AttachmentDescriptor): OpenRouterAttachmentKind {
  const mediaType = normalizeMediaType(contentType)
  if (mediaType === PDF_MEDIA_TYPE) return "pdf"
  if (IMAGE_MEDIA_TYPES.has(mediaType)) return "image"
  if (mediaType.startsWith("audio/")) return "audio"
  if (mediaType.startsWith("video/")) return "video"
  if (mediaType.startsWith("text/") || TEXT_MEDIA_TYPES.has(mediaType))
    return "text"

  // Browsers often omit Markdown and source-code MIME types. Only use the
  // extension when the browser supplied no useful type; explicit types win.
  if (mediaType && mediaType !== DEFAULT_BINARY_MEDIA_TYPE) return "binary"
  const extension = getExtension(name)
  if (extension === ".pdf") return "pdf"
  if (IMAGE_MEDIA_TYPES_BY_EXTENSION.has(extension)) return "image"
  if (TEXT_EXTENSIONS.has(extension)) return "text"
  return "binary"
}

export function decodeOpenRouterTextAttachment(data: ArrayBuffer) {
  const bytes = new Uint8Array(data)
  if (bytes.includes(0)) throw new Error("Attachment contains binary data")
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    throw new Error("Attachment is not valid UTF-8 text")
  }
}

export function resolveOpenRouterAttachmentMediaType(
  attachment: AttachmentDescriptor
) {
  const mediaType = normalizeMediaType(attachment.contentType)
  const extension = getExtension(attachment.name)
  const kind = classifyOpenRouterAttachment(attachment)
  if (kind === "pdf") return PDF_MEDIA_TYPE
  if (kind === "image")
    return IMAGE_MEDIA_TYPES.has(mediaType)
      ? mediaType
      : (IMAGE_MEDIA_TYPES_BY_EXTENSION.get(extension) ??
          DEFAULT_BINARY_MEDIA_TYPE)
  return mediaType || DEFAULT_BINARY_MEDIA_TYPE
}

export function getOpenRouterAttachmentCompatibilityError(
  attachments: AttachmentDescriptor[],
  inputModalities: string[],
  modelLabel: string
) {
  const modalities = new Set(
    inputModalities.map((modality) => modality.trim().toLowerCase())
  )
  for (const attachment of attachments) {
    const kind = classifyOpenRouterAttachment(attachment)
    if (kind === "image" && !modalities.has("image"))
      return `${modelLabel} cannot read image attachments. Choose a model with image input or remove ${JSON.stringify(attachment.name)}.`
    if (kind === "audio" && !modalities.has("audio"))
      return `${modelLabel} cannot read audio attachments. Choose a model with audio input or remove ${JSON.stringify(attachment.name)}.`
    if (kind === "video" && !modalities.has("video"))
      return `${modelLabel} cannot read video attachments. Choose a model with video input or remove ${JSON.stringify(attachment.name)}.`
    if (kind === "binary" && !modalities.has("file"))
      return `${modelLabel} cannot read ${JSON.stringify(attachment.name)}. Choose a model with file input, or attach a PDF or text-based file instead.`
  }
  return null
}
