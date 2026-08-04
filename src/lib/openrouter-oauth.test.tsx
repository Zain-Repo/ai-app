import { describe, expect, it, vi } from "vitest"

import {
  OPENROUTER_PKCE_STORAGE_KEY,
  takeOpenRouterPkceVerifier,
} from "./openrouter-oauth"

const LEGACY_STORAGE_KEY = "ai-harness:openrouter-pkce"

function createStorage(entries: Record<string, string>) {
  const values = new Map(Object.entries(entries))
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => values.delete(key)),
  }
}

describe("OpenRouter PKCE verifier compatibility", () => {
  it("reads and removes the current Dev3 verifier", () => {
    const storage = createStorage({
      [OPENROUTER_PKCE_STORAGE_KEY]: "current-verifier",
    })

    expect(takeOpenRouterPkceVerifier(storage)).toBe("current-verifier")
    expect(storage.removeItem).toHaveBeenCalledWith(OPENROUTER_PKCE_STORAGE_KEY)
    expect(storage.removeItem).toHaveBeenCalledWith(LEGACY_STORAGE_KEY)
  })

  it("falls back to an in-flight verifier created before the rebrand", () => {
    const storage = createStorage({ [LEGACY_STORAGE_KEY]: "legacy-verifier" })

    expect(takeOpenRouterPkceVerifier(storage)).toBe("legacy-verifier")
  })

  it("prefers the current verifier when both keys exist", () => {
    const storage = createStorage({
      [LEGACY_STORAGE_KEY]: "legacy-verifier",
      [OPENROUTER_PKCE_STORAGE_KEY]: "current-verifier",
    })

    expect(takeOpenRouterPkceVerifier(storage)).toBe("current-verifier")
  })
})
