import { afterEach, describe, expect, it, vi } from "vitest"

import {
  isDesktopCodexReasoningEffort,
  parseAgentMessageDelta,
  parseDesktopCodexModels,
  selectCompletedTurnItems,
} from "./codex-app-server"
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
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
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
  it("accepts only agent message deltas for the active thread", () => {
    expect(
      parseAgentMessageDelta(
        "item/agentMessage/delta",
        { delta: "Hello", threadId: "thread-1", turnId: "turn-1" },
        "thread-1"
      )
    ).toBe("Hello")
    expect(
      parseAgentMessageDelta(
        "item/agentMessage/delta",
        { delta: "Wrong thread", threadId: "thread-2" },
        "thread-1"
      )
    ).toBeNull()
    expect(
      parseAgentMessageDelta(
        "item/reasoning/textDelta",
        { delta: "Private reasoning", threadId: "thread-1" },
        "thread-1"
      )
    ).toBeNull()
  })

  it("preserves model reasoning efforts from model/list", () => {
    expect(
      parseDesktopCodexModels({
        data: [
          {
            model: "gpt-5.4",
            displayName: "GPT-5.4",
            supportedReasoningEfforts: [
              { reasoningEffort: "low" },
              { reasoningEffort: "medium" },
              { reasoningEffort: "high" },
              { reasoningEffort: "ultra" },
            ],
            defaultReasoningEffort: "medium",
          },
        ],
      })
    ).toEqual([
      {
        value: "gpt-5.4",
        label: "GPT-5.4",
        reasoningEfforts: ["low", "medium", "high", "ultra"],
        defaultReasoningEffort: "medium",
      },
    ])
  })

  it("allows the current Ultra effort through desktop IPC validation", () => {
    expect(isDesktopCodexReasoningEffort("ultra")).toBe(true)
    expect(isDesktopCodexReasoningEffort("future-effort")).toBe(false)
  })

  it("accepts the legacy effort field while Codex runtimes update", () => {
    expect(
      parseDesktopCodexModels({
        data: [
          {
            model: "gpt-5.3-codex",
            displayName: "GPT-5.3-Codex",
            supportedReasoningEfforts: [{ effort: "high" }],
          },
        ],
      })
    ).toEqual([
      {
        value: "gpt-5.3-codex",
        label: "GPT-5.3-Codex",
        reasoningEfforts: ["high"],
      },
    ])
  })

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
