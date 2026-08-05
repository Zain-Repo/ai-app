import { beforeAll, describe, expect, it, vi } from "vitest"

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: electronMocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}))

beforeAll(async () => {
  await import("./index")
})

describe("desktop preload bridge compatibility", () => {
  it("exposes the same restricted API under the current and legacy names", () => {
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledTimes(2)

    const [currentName, currentApi] =
      electronMocks.exposeInMainWorld.mock.calls[0]
    const [legacyName, legacyApi] =
      electronMocks.exposeInMainWorld.mock.calls[1]

    expect(currentName).toBe("dev3Desktop")
    expect(legacyName).toBe("aiHarnessDesktop")
    expect(currentApi).toBe(legacyApi)
  })

  it("forwards supplied generation IDs and cancellation through scoped channels", async () => {
    electronMocks.invoke.mockResolvedValue({
      content: "Done",
      reasoningSteps: [],
    })
    const api = electronMocks.exposeInMainWorld.mock.calls[0][1]
    await api.codex.generate(
      {
        messages: [{ content: "Hello", role: "user" }],
        model: "gpt-5.6-sol",
      },
      undefined,
      "request-123"
    )
    await api.codex.cancel("request-123")

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "desktop:codex-generate",
      "request-123",
      expect.objectContaining({ model: "gpt-5.6-sol" })
    )
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "desktop:codex-cancel",
      "request-123"
    )
  })
})
