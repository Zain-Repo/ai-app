import { describe, expect, it } from "vitest"

import { isSupportedForgeNodeVersion } from "./forge-node-runtime"

describe("Forge Node runtime guard", () => {
  it("rejects the Node release that exits before Forge postPackage", () => {
    expect(isSupportedForgeNodeVersion("24.14.0")).toBe(true)
    expect(isSupportedForgeNodeVersion("24.16.0")).toBe(false)
    expect(isSupportedForgeNodeVersion("25.0.0")).toBe(false)
  })
})
