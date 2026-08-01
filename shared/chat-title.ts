export const MAX_CHAT_TITLE_LENGTH = 40
export const MAX_CHAT_TITLE_WORDS = 5

export const CHAT_TITLE_INSTRUCTIONS = `Summarize the user's initial question as a simple chat title.
Use 2 to ${MAX_CHAT_TITLE_WORDS} words and at most ${MAX_CHAT_TITLE_LENGTH} characters.
Return only the title with no quotes, label, markdown, or ending punctuation.`

export function createFallbackChatTitle(initialQuestion: string) {
  return initialQuestion.replace(/\s+/g, " ").slice(0, MAX_CHAT_TITLE_LENGTH)
}

export function normalizeGeneratedChatTitle(value: string) {
  const title = (value.trim().split(/\r?\n/, 1)[0] ?? "")
    .replace(/^#+\s*/, "")
    .replace(/^["'`*_~]+|["'`*_~]+$/g, "")
    .replace(/^(?:chat\s+)?title:\s*/i, "")
    .replace(/^["'`*_~]+|["'`*_~]+$/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/[.!?;:]+$/, "")
    .trim()
    .split(/\s+/)
    .slice(0, MAX_CHAT_TITLE_WORDS)
    .join(" ")
  if (title.length <= MAX_CHAT_TITLE_LENGTH) return title
  const shortened = title.slice(0, MAX_CHAT_TITLE_LENGTH)
  const lastSpace = shortened.lastIndexOf(" ")
  return lastSpace > 0 ? shortened.slice(0, lastSpace) : shortened
}

export function isValidGeneratedChatTitle(value: string) {
  return (
    Boolean(value) &&
    value.length <= MAX_CHAT_TITLE_LENGTH &&
    !/[\r\n*_~`]/.test(value) &&
    !/^\s*#/.test(value) &&
    !/\[[^\]]+\]\([^)]+\)/.test(value) &&
    normalizeGeneratedChatTitle(value) === value
  )
}
