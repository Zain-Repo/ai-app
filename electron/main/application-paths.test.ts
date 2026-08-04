import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import { preserveLegacyUserDataDirectory } from "./application-paths"

describe("desktop application paths", () => {
  it("preserves the legacy user-data directory for packaged upgrades", () => {
    const setPath = vi.fn()

    preserveLegacyUserDataDirectory({
      getPath: () => path.join("C:", "Users", "dev", "AppData", "Roaming"),
      isPackaged: true,
      setPath,
    })

    expect(setPath).toHaveBeenCalledWith(
      "userData",
      path.join("C:", "Users", "dev", "AppData", "Roaming", "ai-harness")
    )
  })

  it("leaves development user-data behavior unchanged", () => {
    const setPath = vi.fn()

    preserveLegacyUserDataDirectory({
      getPath: () => "unused",
      isPackaged: false,
      setPath,
    })

    expect(setPath).not.toHaveBeenCalled()
  })
})
