import { describe, expect, it } from "vitest"

import {
  getDefaultWelcomeMessage,
  selectWelcomeMessage,
  WELCOME_DESCRIPTION,
} from "./welcome-message"

describe("welcome message selection", () => {
  it("does not repeat the previous launch greeting", () => {
    const previousMessage = getDefaultWelcomeMessage()

    expect(selectWelcomeMessage(previousMessage.id, 0).id).not.toBe(
      previousMessage.id
    )
    expect(selectWelcomeMessage(previousMessage.id, 0.999).id).not.toBe(
      previousMessage.id
    )
  })

  it("keeps out-of-range random values within the available greetings", () => {
    expect(selectWelcomeMessage(null, -1).id).toBe(
      getDefaultWelcomeMessage().id
    )
    expect(selectWelcomeMessage(null, Number.POSITIVE_INFINITY).id).toBe(
      getDefaultWelcomeMessage().id
    )
  })

  it("personalizes the greeting when a name is available", () => {
    const messages = [0, 0.2, 0.4, 0.6, 0.8, 0.999].map((randomValue) =>
      selectWelcomeMessage(null, randomValue)
    )

    expect(new Set(messages.map((message) => message.id)).size).toBe(6)
    for (const message of messages) {
      expect(message.title("Zain")).toContain("Zain")
      expect(message.title(null)).not.toContain("null")
    }
    expect(WELCOME_DESCRIPTION).toContain("Attach files")
  })
})
