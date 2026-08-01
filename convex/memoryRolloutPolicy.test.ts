import { describe, expect, it } from "vitest"

import {
  getMemoryCaptureStoragePlan,
  getMemoryV2RolloutMode,
} from "./memoryRolloutPolicy"

describe("memory v2 rollout policy", () => {
  it("defaults safely to shadow and only enables explicitly", () => {
    expect(getMemoryV2RolloutMode(undefined)).toBe("shadow")
    expect(getMemoryV2RolloutMode("off")).toBe("off")
    expect(getMemoryV2RolloutMode("enabled")).toBe("enabled")
  })

  it("uses isolated, dual-write, and v2-only capture storage for off, shadow, and enabled", () => {
    expect(getMemoryCaptureStoragePlan("off")).toEqual({
      writeLegacy: true,
      writeV2: false,
    })
    expect(getMemoryCaptureStoragePlan("shadow")).toEqual({
      writeLegacy: true,
      writeV2: true,
    })
    expect(getMemoryCaptureStoragePlan("enabled")).toEqual({
      writeLegacy: false,
      writeV2: true,
    })
  })
})
