import { describe, expect, it } from "vitest"

import {
  forgePackageMode,
  isLocalOnlyPackage,
  isSupportedForgeNodeVersion,
  unsignedPackageMetadata,
} from "./forge-node-runtime"

describe("Forge Node runtime guard", () => {
  it("rejects the Node release that exits before Forge postPackage", () => {
    expect(isSupportedForgeNodeVersion("24.14.0")).toBe(true)
    expect(isSupportedForgeNodeVersion("24.16.0")).toBe(false)
    expect(isSupportedForgeNodeVersion("25.0.0")).toBe(false)
  })
})

describe("Forge package mode guard", () => {
  it("recognizes explicit package modes", () => {
    expect(isLocalOnlyPackage(["--local-only"])).toBe(true)
    expect(isLocalOnlyPackage(["--local-only=true"])).toBe(false)
    expect(isLocalOnlyPackage([])).toBe(false)
    expect(forgePackageMode(["--store"])).toBe("store")
    expect(forgePackageMode(["--store=true"])).toBe("release")
    expect(() => forgePackageMode(["--local-only", "--store"])).toThrow(
      "cannot be both"
    )
  })

  it("records every package mode as unsigned without signing claims", () => {
    expect(
      unsignedPackageMetadata("release", {
        distribution: "microsoft-store",
        localOnly: true,
        outputPath: "out/app",
        signing: { trust: "publisher" },
      })
    ).toEqual({
      distribution: "github-updater",
      outputPath: "out/app",
      unsigned: true,
    })
    expect(unsignedPackageMetadata("local-only", {})).toEqual({
      localOnly: true,
      unsigned: true,
    })
    expect(unsignedPackageMetadata("store", {})).toEqual({
      distribution: "microsoft-store",
      unsigned: true,
    })
  })
})
