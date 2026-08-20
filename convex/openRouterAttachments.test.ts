import { describe, expect, it } from "vitest"

import {
  classifyOpenRouterAttachment,
  decodeOpenRouterTextAttachment,
  getOpenRouterAttachmentCompatibilityError,
  resolveOpenRouterAttachmentMediaType,
} from "../shared/openrouter-attachments"

describe("OpenRouter attachment compatibility", () => {
  it.each(["", "application/octet-stream"])(
    "treats Markdown with %j MIME as safe inline text",
    (contentType) => {
      expect(
        classifyOpenRouterAttachment({ contentType, name: "project-notes.md" })
      ).toBe("text")
      expect(
        getOpenRouterAttachmentCompatibilityError(
          [{ contentType, name: "project-notes.md" }],
          ["text"],
          "Text model"
        )
      ).toBeNull()
    }
  )

  it("lets an explicit MIME type override a contradictory extension", () => {
    expect(
      classifyOpenRouterAttachment({
        contentType: "text/plain; charset=utf-8",
        name: "misleading.png",
      })
    ).toBe("text")
    expect(
      classifyOpenRouterAttachment({
        contentType: "application/zip",
        name: "misleading.md",
      })
    ).toBe("binary")
  })

  it("rejects binary content renamed with a safe text extension", () => {
    const renamedBinary = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x00])
    expect(() => decodeOpenRouterTextAttachment(renamedBinary.buffer)).toThrow(
      "binary data"
    )
    expect(() =>
      decodeOpenRouterTextAttachment(Uint8Array.from([0xff, 0xfe]).buffer)
    ).toThrow("UTF-8")
  })

  it("keeps PDFs compatible with text-only models and normalizes their MIME", () => {
    const attachment = {
      contentType: "application/octet-stream",
      name: "brief.pdf",
    }
    expect(classifyOpenRouterAttachment(attachment)).toBe("pdf")
    expect(resolveOpenRouterAttachmentMediaType(attachment)).toBe(
      "application/pdf"
    )
    expect(
      getOpenRouterAttachmentCompatibilityError(
        [attachment],
        ["text"],
        "Text model"
      )
    ).toBeNull()
  })

  it("rejects images when the selected model lacks image input", () => {
    expect(
      getOpenRouterAttachmentCompatibilityError(
        [{ contentType: "image/png", name: "diagram.png" }],
        ["text", "file"],
        "File model"
      )
    ).toBe(
      'File model cannot read image attachments. Choose a model with image input or remove "diagram.png".'
    )
  })

  it.each([
    ["audio/mpeg", "recording.mp3", "audio"],
    ["video/mp4", "demo.mp4", "video"],
  ])(
    "matches %s attachments to the model's %s input capability",
    (contentType, name, modality) => {
      const attachment = { contentType, name }
      expect(classifyOpenRouterAttachment(attachment)).toBe(modality)
      expect(
        getOpenRouterAttachmentCompatibilityError(
          [attachment],
          ["text", modality],
          "Multimodal model"
        )
      ).toBeNull()
      expect(
        getOpenRouterAttachmentCompatibilityError(
          [attachment],
          ["text"],
          "Text model"
        )
      ).toContain(`cannot read ${modality} attachments`)
    }
  )

  it("rejects unknown binary files unless the model advertises file input", () => {
    const attachment = {
      contentType: "application/zip",
      name: "archive.zip",
    }
    expect(
      getOpenRouterAttachmentCompatibilityError(
        [attachment],
        ["text"],
        "Text model"
      )
    ).toContain('cannot read "archive.zip"')
    expect(
      getOpenRouterAttachmentCompatibilityError(
        [attachment],
        ["text", "file"],
        "File model"
      )
    ).toBeNull()
  })
})
