import { describe, expect, it } from "vitest"

import { CodexRequestOwnership } from "./codex-request-ownership"

describe("Codex request ownership", () => {
  it("allows only the renderer that started a request to cancel it", () => {
    const ownership = new CodexRequestOwnership()

    expect(ownership.register("request-1", 101)).toBe(true)
    expect(ownership.register("request-1", 202)).toBe(false)
    expect(ownership.isOwner("request-1", 101)).toBe(true)
    expect(ownership.isOwner("request-1", 202)).toBe(false)

    ownership.release("request-1")
    expect(ownership.isOwner("request-1", 101)).toBe(false)
  })
})
