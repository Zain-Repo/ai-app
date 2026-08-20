import { describe, expect, it } from "vitest"

import { matchesProviderSearch, providers } from "./provider-connect-dialog"

describe("provider search", () => {
  it("keeps Vercel in the direct provider catalog", () => {
    expect(providers).toContainEqual({
      id: "vercel",
      name: "Vercel",
      mark: "V",
      description: "Use Vercel AI Gateway with an API key",
      auth: "API key",
    })
  })

  it("matches names and connection types case-insensitively", () => {
    expect(
      matchesProviderSearch("  claude ", ["Anthropic", "Claude API"])
    ).toBe(true)
    expect(matchesProviderSearch("oauth", ["OpenRouter", "OAuth + PKCE"])).toBe(
      true
    )
    expect(matchesProviderSearch("gemini", ["OpenAI", "API key"])).toBe(false)
    expect(matchesProviderSearch("image", ["Fal", "Image API key"])).toBe(true)
  })
})
