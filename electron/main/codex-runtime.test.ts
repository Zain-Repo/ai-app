import { afterEach, describe, expect, it, vi } from "vitest"
import fs from "node:fs"

import {
  CodexAppServer,
  isDesktopCodexReasoningEffort,
  parseAgentMessageDelta,
  parseAgentMessageStart,
  parseCompletedCodexResponse,
  parseDesktopCodexModels,
  selectCompletedTurnItems,
} from "./codex-app-server"
import {
  fetchReleaseCodexVersion,
  parseCodexRuntimeManifest,
  parseCodexVersion,
} from "./codex-runtime"

vi.mock("electron", () => ({
  app: { getPath: () => "C:/test-user-data" },
  shell: {},
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let resolve = (_value: T) => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

type TestableCodexServer = {
  request: (
    method: string,
    params?: Record<string, unknown>
  ) => Promise<unknown>
  waitForNotification: (
    method: string,
    predicate: (params: Record<string, unknown>) => boolean,
    timeoutMs: number
  ) => Promise<Record<string, unknown>>
}

const generationInput = {
  messages: [{ content: "Hello", role: "user" as const }],
  model: "gpt-test",
}

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
  it("interrupts the originating thread and turn after turn/start", async () => {
    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined)
    const server = new CodexAppServer()
    const internals = server as unknown as TestableCodexServer
    const completion = deferred<Record<string, unknown>>()
    const request = vi
      .spyOn(internals, "request")
      .mockImplementation(async (method) => {
        if (method === "account/read") return { account: { type: "chatgpt" } }
        if (method === "thread/start") return { thread: { id: "thread-1" } }
        if (method === "turn/start") return { turn: { id: "turn-1" } }
        if (method === "turn/interrupt") return {}
        throw new Error(`Unexpected request: ${method}`)
      })
    vi.spyOn(internals, "waitForNotification").mockReturnValue(
      completion.promise
    )

    const generation = server.generate("request-1", generationInput)
    await vi.waitFor(() =>
      expect(internals.waitForNotification).toHaveBeenCalled()
    )
    const cancellation = server.cancel("request-1")
    await vi.waitFor(() =>
      expect(request).toHaveBeenCalledWith("turn/interrupt", {
        threadId: "thread-1",
        turnId: "turn-1",
      })
    )
    completion.resolve({ turn: { id: "turn-1", status: "interrupted" } })

    await expect(cancellation).resolves.toBe(true)
    await expect(generation).resolves.toEqual({
      content: "",
      interrupted: true,
      reasoningSteps: [],
    })
  })

  it("handles cancellation while turn/start is still pending", async () => {
    vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined)
    const server = new CodexAppServer()
    const internals = server as unknown as TestableCodexServer
    const turnStart = deferred<unknown>()
    const requestedMethods: string[] = []
    const request = vi
      .spyOn(internals, "request")
      .mockImplementation(async (method) => {
        requestedMethods.push(method)
        if (method === "account/read") return { account: { type: "chatgpt" } }
        if (method === "thread/start") return { thread: { id: "thread-1" } }
        if (method === "turn/start") return await turnStart.promise
        if (method === "turn/interrupt") return {}
        throw new Error(`Unexpected request: ${method}`)
      })
    vi.spyOn(internals, "waitForNotification").mockResolvedValue({
      turn: { id: "turn-1", status: "interrupted" },
    })

    const generation = server.generate("request-1", generationInput)
    await vi.waitFor(() => expect(requestedMethods).toContain("turn/start"))
    const cancellation = server.cancel("request-1")
    turnStart.resolve({ turn: { id: "turn-1" } })

    await expect(cancellation).resolves.toBe(true)
    await expect(generation).resolves.toEqual({
      content: "",
      interrupted: true,
      reasoningSteps: [],
    })
    expect(request).toHaveBeenCalledWith("turn/interrupt", {
      threadId: "thread-1",
      turnId: "turn-1",
    })
  })

  it("accepts only agent message deltas for the active thread", () => {
    expect(
      parseAgentMessageDelta(
        "item/agentMessage/delta",
        {
          delta: "Hello",
          itemId: "message-1",
          threadId: "thread-1",
          turnId: "turn-1",
        },
        "thread-1"
      )
    ).toEqual({ delta: "Hello", itemId: "message-1" })
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

  it("classifies commentary and final answer message items", () => {
    expect(
      parseAgentMessageStart(
        "item/started",
        {
          item: {
            id: "commentary-1",
            phase: "commentary",
            text: "",
            type: "agentMessage",
          },
          threadId: "thread-1",
        },
        "thread-1"
      )
    ).toEqual({ itemId: "commentary-1", phase: "commentary" })
    expect(
      parseAgentMessageStart(
        "item/started",
        {
          item: {
            id: "answer-1",
            phase: "final_answer",
            text: "",
            type: "agentMessage",
          },
          threadId: "thread-1",
        },
        "thread-1"
      )
    ).toEqual({ itemId: "answer-1", phase: "final_answer" })
    expect(
      parseAgentMessageStart(
        "item/started",
        {
          item: {
            id: "legacy-1",
            phase: null,
            text: "",
            type: "agentMessage",
          },
          threadId: "thread-1",
        },
        "thread-1"
      )
    ).toEqual({ itemId: "legacy-1", phase: null })
  })

  it("separates commentary from the completed final answer", () => {
    expect(
      parseCompletedCodexResponse([
        {
          id: "commentary-1",
          phase: "commentary",
          text: "I am checking the available models.",
          type: "agentMessage",
        },
        {
          id: "reasoning-1",
          summary: ["Compared current capabilities"],
          type: "reasoning",
        },
        {
          id: "answer-1",
          phase: "final_answer",
          text: "Use the image model.",
          type: "agentMessage",
        },
      ])
    ).toEqual({
      content: "Use the image model.",
      reasoningSteps: [
        "I am checking the available models.",
        "Compared current capabilities",
      ],
    })
    expect(
      parseCompletedCodexResponse([
        { id: "legacy-1", text: "Legacy answer", type: "agentMessage" },
      ])
    ).toEqual({ content: "Legacy answer", reasoningSteps: [] })
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
