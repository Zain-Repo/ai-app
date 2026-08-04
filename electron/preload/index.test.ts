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
})
