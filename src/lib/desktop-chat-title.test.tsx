import { describe, expect, it, vi } from "vitest"

import type { Dev3DesktopApi } from "../../electron/types"
import {
  DESKTOP_CHAT_TITLE_INSTRUCTIONS,
  generateDesktopChatTitle,
} from "./desktop-chat-title"

function createDesktop(
  generate: Dev3DesktopApi["codex"]["generate"]
): Dev3DesktopApi {
  return {
    isDesktop: true,
    version: vi.fn(),
    codex: {
      account: vi.fn(),
      generate,
      listModels: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
    cursor: {
      account: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
    },
    updater: {
      check: vi.fn(),
      download: vi.fn(),
      getState: vi.fn(),
      install: vi.fn(),
      onState: vi.fn(),
    },
  }
}

describe("desktop chat title generation", () => {
  it("summarizes only the initial question in an independent Codex turn", async () => {
    const generate = vi.fn().mockResolvedValue({
      content: 'Title: "PostgreSQL Index Strategy"',
      reasoningSteps: [],
    })
    const setGeneratedTitle = vi.fn().mockResolvedValue(null)

    await generateDesktopChatTitle({
      conversationId: "conversation-1",
      desktop: createDesktop(generate),
      initialQuestion: "How should I index a large PostgreSQL events table?",
      model: "gpt-5.6-sol",
      setGeneratedTitle,
    })

    expect(generate).toHaveBeenCalledWith({
      developerInstructions: DESKTOP_CHAT_TITLE_INSTRUCTIONS,
      messages: [
        {
          content: "How should I index a large PostgreSQL events table?",
          role: "user",
        },
      ],
      model: "gpt-5.6-sol",
    })
    expect(setGeneratedTitle).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      title: "PostgreSQL Index Strategy",
    })
  })

  it("keeps the prompt fallback when the background model fails", async () => {
    const setGeneratedTitle = vi.fn().mockResolvedValue(null)

    await expect(
      generateDesktopChatTitle({
        conversationId: "conversation-1",
        desktop: createDesktop(
          vi.fn().mockRejectedValue(new Error("Codex unavailable"))
        ),
        initialQuestion: "Create an image of a mountain cabin",
        model: "gpt-5.6-sol",
        setGeneratedTitle,
      })
    ).resolves.toBeUndefined()
    expect(setGeneratedTitle).not.toHaveBeenCalled()
  })
})
