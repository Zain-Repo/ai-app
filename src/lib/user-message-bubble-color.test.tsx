import { describe, expect, it } from "vitest"

import {
  getUserMessageBubbleColorClassName,
  resolveUserMessageBubbleColor,
  userMessageBubbleColorOptions,
} from "./user-message-bubble-color"

describe("user message bubble colors", () => {
  it("exposes the supported fixed palette in display order", () => {
    expect(userMessageBubbleColorOptions.map((option) => option.value)).toEqual(
      ["default", "sky", "violet", "rose", "emerald", "amber", "slate"]
    )
  })

  it("keeps the current default appearance and rejects unsupported values", () => {
    expect(getUserMessageBubbleColorClassName("default")).toBeUndefined()
    expect(resolveUserMessageBubbleColor("custom-css")).toBe("default")
  })

  it("pairs each named background with an explicit readable foreground", () => {
    for (const option of userMessageBubbleColorOptions.slice(1)) {
      expect(option.bubbleClassName).toMatch(/!text-/)
      expect(option.bubbleClassName).toMatch(/dark:!text-/)
    }
  })
})
