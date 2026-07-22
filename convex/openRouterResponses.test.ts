import { describe, expect, it } from "vitest"

import type { Id } from "./_generated/dataModel"
import {
  getOpenRouterModelSettings,
  getPrivateOpenRouterEmbeddingSettings,
  inlineTextAttachments,
  normalizeGeneratedTitle,
  toModelPrompt,
} from "./openRouterResponses"

describe("AI SDK provider bridge", () => {
  it("inlines stored text files instead of sending unsupported file inputs", async () => {
    const storageId = "kg2abc" as Id<"_storage">
    const messages = await inlineTextAttachments(
      [
        {
          attachments: [
            {
              contentType: "text/markdown",
              name: "notes.md",
              storageId,
              url: "https://files.example/notes.md",
            },
            {
              contentType: "application/pdf",
              name: "brief.pdf",
              storageId: "kg2pdf" as Id<"_storage">,
              url: "https://files.example/brief.pdf",
            },
          ],
          content: "Use these sources.",
          role: "user",
        },
      ],
      async (id) =>
        id === storageId ? new Blob(["# Stored project context"]) : null
    )

    expect(messages).toEqual([
      {
        attachments: [
          {
            contentType: "application/pdf",
            name: "brief.pdf",
            storageId: "kg2pdf",
            url: "https://files.example/brief.pdf",
          },
        ],
        content:
          'Use these sources.\n\nReferenced file "notes.md":\n--- BEGIN FILE ---\n# Stored project context\n--- END FILE ---',
        role: "user",
      },
    ])
  })

  it("converts attachments to AI SDK multimodal messages", () => {
    expect(
      toModelPrompt([
        { content: "System", role: "system" },
        {
          attachments: [
            {
              contentType: "image/png",
              name: "screen.png",
              url: "https://files.example/screen.png",
            },
            {
              contentType: "application/pdf",
              name: "brief.pdf",
              url: "https://files.example/brief.pdf",
            },
          ],
          content: "Review these files",
          role: "user",
        },
      ])
    ).toEqual({
      instructions: "System",
      messages: [
        {
          role: "user",
          content: [
            { text: "Review these files", type: "text" },
            {
              image: new URL("https://files.example/screen.png"),
              mediaType: "image/png",
              type: "image",
            },
            {
              data: new URL("https://files.example/brief.pdf"),
              filename: "brief.pdf",
              mediaType: "application/pdf",
              type: "file",
            },
          ],
        },
      ],
    })
  })

  it("preserves OpenRouter routing, privacy, and reasoning", () => {
    const messages = [
      {
        attachments: [
          {
            contentType: "application/pdf",
            name: "brief.pdf",
            url: "https://files.example/brief.pdf",
          },
        ],
        content: "Review this",
        role: "user" as const,
      },
    ]
    expect(
      getOpenRouterModelSettings(
        "deepseek/deepseek-chat",
        messages,
        "max",
        undefined
      )
    ).toMatchObject({
      plugins: [{ id: "file-parser" }],
      reasoning: { effort: "xhigh" },
      extraBody: {
        provider: {
          allow_fallbacks: true,
          data_collection: "deny",
          preferred_max_latency: { p90: 3 },
          require_parameters: true,
          sort: { by: "price", partition: "model" },
        },
        store: false,
      },
    })
    expect(
      getOpenRouterModelSettings(
        "deepseek/deepseek-chat",
        [],
        undefined,
        "auto"
      )
    ).toMatchObject({
      extraBody: {
        provider: {
          allow_fallbacks: true,
          data_collection: "deny",
          require_parameters: true,
          sort: "price",
        },
      },
    })
    expect(getPrivateOpenRouterEmbeddingSettings()).toMatchObject({
      extraBody: {
        dimensions: 1536,
        encoding_format: "float",
        provider: {
          data_collection: "deny",
          require_parameters: true,
          zdr: true,
        },
      },
    })
  })

  it("normalizes prompt-based chat titles", () => {
    expect(
      normalizeGeneratedTitle(
        'Title: "Understanding PostgreSQL Database Indexes Clearly Today!"'
      )
    ).toBe("Understanding PostgreSQL Database")
    expect(normalizeGeneratedTitle("x".repeat(80))).toHaveLength(40)
    expect(
      normalizeGeneratedTitle('**Chat title: "Clean Landing Page"**')
    ).toBe("Clean Landing Page")
  })
})
