import { describe, expect, it } from "vitest"

import { matchesProviderSearch } from "./provider-connect-dialog"

describe("provider search", () => {
  it("matches names and connection types case-insensitively", () => {
    expect(
      matchesProviderSearch("  claude ", ["Anthropic", "Claude API"])
    ).toBe(true)
    expect(matchesProviderSearch("oauth", ["OpenRouter", "OAuth + PKCE"])).toBe(
      true
    )
    expect(matchesProviderSearch("gemini", ["OpenAI", "API key"])).toBe(false)
  })
})
