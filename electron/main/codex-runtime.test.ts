import { describe, expect, it, vi } from "vitest"

import { selectCompletedTurnItems } from "./codex-app-server"
import { parseCodexRuntimeManifest, parseCodexVersion } from "./codex-runtime"

vi.mock("electron", () => ({ app: {}, shell: {} }))

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

describe("Codex app-server protocol", () => {
  it("uses completed item notifications when the final turn omits items", () => {
    expect(
      selectCompletedTurnItems(
        { items: [] },
        [
          {
            item: { id: "answer", text: "OK", type: "agentMessage" },
            turnId: "turn-1",
          },
        ],
        "turn-1"
      )
    ).toEqual([{ id: "answer", text: "OK", type: "agentMessage" }])

    expect(
      selectCompletedTurnItems(
        { items: [{ id: "legacy", text: "Fallback", type: "agentMessage" }] },
        [],
        "turn-1"
      )
    ).toEqual([{ id: "legacy", text: "Fallback", type: "agentMessage" }])
  })
})
