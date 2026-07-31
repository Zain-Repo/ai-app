import { afterEach, describe, expect, it, vi } from "vitest"

import { selectCompletedTurnItems } from "./codex-app-server"
import {
  fetchReleaseCodexVersion,
  parseCodexRuntimeManifest,
  parseCodexVersion,
} from "./codex-runtime"

vi.mock("electron", () => ({ app: {}, shell: {} }))

afterEach(() => vi.unstubAllGlobals())

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

  it("reads runtime metadata from this repository's release", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ appVersion: "0.1.7", codexVersion: "0.146.0" })
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(fetchReleaseCodexVersion("0.1.7")).resolves.toBe("0.146.0")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://github.com/Zain-Repo/ai-app/releases/download/v0.1.7/codex-runtime.json",
      expect.objectContaining({ signal: expect.anything() })
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
