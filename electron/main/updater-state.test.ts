import { describe, expect, it } from "vitest"

import {
  canCheckForDesktopUpdates,
  canDownloadDesktopUpdate,
  canInstallDesktopUpdate,
  createDesktopUpdaterState,
  reduceDesktopUpdaterState,
} from "./updater-state"

describe("desktop updater state", () => {
  it("moves through check, download, and install without stale fields", () => {
    let state = createDesktopUpdaterState("0.1.1", true)

    state = reduceDesktopUpdaterState(state, { type: "checking" })
    expect(state.status).toBe("checking")
    state = reduceDesktopUpdaterState(state, {
      type: "codex-current",
      version: "0.145.0",
    })

    state = reduceDesktopUpdaterState(state, {
      type: "update-available",
      version: "0.1.2",
    })
    expect(canDownloadDesktopUpdate(state)).toBe(true)
    state = reduceDesktopUpdaterState(state, {
      type: "codex-included",
      version: "0.146.0",
    })
    expect(state.codex).toEqual({
      currentVersion: "0.145.0",
      error: null,
      includedVersion: "0.146.0",
    })

    state = reduceDesktopUpdaterState(state, {
      progress: 140,
      type: "download-progress",
    })
    expect(state.progress).toBe(100)

    state = reduceDesktopUpdaterState(state, {
      type: "update-downloaded",
      version: "0.1.2",
    })
    expect(canInstallDesktopUpdate(state)).toBe(true)
    expect(canCheckForDesktopUpdates(state)).toBe(false)

    state = reduceDesktopUpdaterState(state, {
      message: "network failed",
      type: "error",
    })
    expect(state).toMatchObject({
      error: "network failed",
      progress: null,
      status: "error",
    })

    state = reduceDesktopUpdaterState(state, { type: "update-not-available" })
    expect(state).toMatchObject({
      availableVersion: null,
      error: null,
      progress: null,
      status: "up-to-date",
    })
  })
})
