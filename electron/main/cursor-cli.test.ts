import { describe, expect, it } from "vitest"

import { cursorIsAuthenticated } from "./cursor-cli"

describe("Cursor CLI status", () => {
  it("does not treat an unauthenticated CLI as connected", () => {
    expect(cursorIsAuthenticated("Not authenticated")).toBe(false)
    expect(cursorIsAuthenticated("Unauthenticated")).toBe(false)
    expect(cursorIsAuthenticated("")).toBe(false)
    expect(cursorIsAuthenticated("Signed in as developer@example.com")).toBe(
      true
    )
  })
})
