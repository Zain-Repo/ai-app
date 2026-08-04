// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DesktopUpdaterState } from "../../electron/types"
import {
  DesktopUpdater,
  getDesktopUpdaterPresentation,
  openDesktopUpdaterDialog,
} from "./desktop-updater"

vi.mock("sonner", () => ({
  toast: {
    dismiss: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    success: vi.fn(),
  },
}))

const idleState: DesktopUpdaterState = {
  availableVersion: null,
  codex: {
    currentVersion: "0.145.0",
    error: null,
    includedVersion: null,
  },
  currentVersion: "0.1.1",
  error: null,
  progress: null,
  status: "idle",
}

let emitState: (state: DesktopUpdaterState) => void

beforeEach(() => {
  const updater = {
    check: vi.fn(async () => idleState),
    download: vi.fn(async () => idleState),
    getState: vi.fn(async () => idleState),
    install: vi.fn(async () => idleState),
    onState: vi.fn((callback: (state: DesktopUpdaterState) => void) => {
      emitState = callback
      return vi.fn()
    }),
  }
  Object.defineProperty(window, "dev3Desktop", {
    configurable: true,
    value: { isDesktop: true, updater },
  })
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, "aiHarnessDesktop")
  Reflect.deleteProperty(window, "dev3Desktop")
})

describe("desktop updater dialog", () => {
  it("uses the legacy desktop bridge while older clients upgrade", async () => {
    const legacyUpdater = window.dev3Desktop?.updater
    Reflect.deleteProperty(window, "dev3Desktop")
    Object.defineProperty(window, "aiHarnessDesktop", {
      configurable: true,
      value: { isDesktop: true, updater: legacyUpdater },
    })

    render(<DesktopUpdater />)
    act(openDesktopUpdaterDialog)

    expect(
      await screen.findByRole("button", { name: "Check for updates" })
    ).toBeTruthy()
  })

  it("keeps receiving background state after the dialog closes", async () => {
    render(<DesktopUpdater />)

    act(openDesktopUpdaterDialog)
    expect(
      await screen.findByRole("dialog", { name: "App updates" })
    ).toBeTruthy()
    expect(
      screen.getByRole("button", { name: "Check for updates" })
    ).toBeTruthy()
    expect(screen.getByText("Codex CLI")).toBeTruthy()
    expect(
      screen.getByText("Updates with the signed app installer.")
    ).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "App updates" })).toBeNull()
    )

    act(() =>
      emitState({
        ...idleState,
        availableVersion: "0.1.2",
        progress: 100,
        status: "ready-to-install",
      })
    )
    act(openDesktopUpdaterDialog)

    expect(
      await screen.findByRole("button", { name: "Restart and install" })
    ).toBeTruthy()
    expect(screen.getByText("Ready to restart")).toBeTruthy()
  })

  it("gives every actionable state one unambiguous action", () => {
    expect(getDesktopUpdaterPresentation(idleState).action).toBe("check")
    expect(
      getDesktopUpdaterPresentation({
        ...idleState,
        availableVersion: "0.1.2",
        status: "update-available",
      }).action
    ).toBe("download")
    expect(
      getDesktopUpdaterPresentation({
        ...idleState,
        availableVersion: "0.1.2",
        status: "ready-to-install",
      }).action
    ).toBe("install")
    expect(
      getDesktopUpdaterPresentation({
        ...idleState,
        progress: 42,
        status: "downloading",
      }).action
    ).toBeNull()
  })

  it("explains that Microsoft Store packages use Store updates", () => {
    const presentation = getDesktopUpdaterPresentation({
      ...idleState,
      status: "store-managed",
    })
    expect(presentation.action).toBeNull()
    expect(presentation.title).toBe("Updates are managed by Microsoft Store")
  })
})
