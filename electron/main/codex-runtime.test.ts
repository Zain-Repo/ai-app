import { describe, expect, it } from "vitest"

import { parseCodexRuntimeManifest, parseCodexVersion } from "./codex-runtime"

describe("Codex runtime metadata", () => {
  it("accepts only the expected app release and a valid Codex version", () => {
    expect(parseCodexVersion("codex-cli 0.145.0\n")).toBe("0.145.0")
    expect(
      parseCodexRuntimeManifest(
        { appVersion: "0.1.7", codexVersion: "0.146.0" },
        "0.1.7"
      )
    ).toBe("0.146.0")
    expect(() =>
      parseCodexRuntimeManifest(
        { appVersion: "0.1.6", codexVersion: "0.146.0" },
        "0.1.7"
      )
    ).toThrow("does not match")
    expect(() => parseCodexVersion("codex-cli latest")).toThrow(
      "invalid version"
    )
  })
})
