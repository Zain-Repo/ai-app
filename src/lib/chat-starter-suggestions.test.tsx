import { describe, expect, it } from "vitest"

import { getChatStarterSuggestions } from "./chat-starter-suggestions"

describe("getChatStarterSuggestions", () => {
  it("returns coding-oriented prompts for chat", () => {
    const suggestions = getChatStarterSuggestions("chat")

    expect(suggestions).toHaveLength(4)
    expect(suggestions.map(({ label }) => label)).toContain("Debug an issue")
  })

  it("returns visual prompts for image generation", () => {
    const suggestions = getChatStarterSuggestions("image")

    expect(suggestions).toHaveLength(4)
    expect(suggestions.map(({ label }) => label)).toContain("Product hero")
  })
})
