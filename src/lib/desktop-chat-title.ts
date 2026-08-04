import type { Dev3DesktopApi } from "../../electron/types"
import {
  CHAT_TITLE_INSTRUCTIONS,
  normalizeGeneratedChatTitle,
} from "../../shared/chat-title"

export const DESKTOP_CHAT_TITLE_INSTRUCTIONS = `${CHAT_TITLE_INSTRUCTIONS}
Do not inspect files, run commands, or modify the filesystem.`

type SetDesktopGeneratedTitle = (args: {
  conversationId: string
  title: string
}) => Promise<unknown>

export async function generateDesktopChatTitle(args: {
  conversationId: string
  desktop: Dev3DesktopApi
  initialQuestion: string
  model: string
  setGeneratedTitle: SetDesktopGeneratedTitle
}) {
  try {
    const result = await args.desktop.codex.generate({
      developerInstructions: DESKTOP_CHAT_TITLE_INSTRUCTIONS,
      messages: [{ content: args.initialQuestion, role: "user" }],
      model: args.model,
    })
    const title = normalizeGeneratedChatTitle(result.content)
    if (!title) return
    await args.setGeneratedTitle({
      conversationId: args.conversationId,
      title,
    })
  } catch {
    // A prompt-based fallback is already visible; title generation is optional.
  }
}
