import { v } from "convex/values"

export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export const messageAttachmentValidator = v.object({
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
})

export function normalizeAttachmentName(name: string) {
  const normalized = name
    .split(/[\\/]/)
    .at(-1)
    ?.split("")
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 31 && code !== 127
    })
    .join("")
    .trim()
    .slice(0, 255)
  return normalized || "attachment"
}
