import type { DesktopUpdaterState } from "../types"

export type DesktopUpdaterEvent =
  | { type: "checking" }
  | { type: "codex-current"; version: string }
  | { type: "codex-error"; message: string }
  | { type: "codex-included"; version: string }
  | { type: "download-started" }
  | { progress: number; type: "download-progress" }
  | { type: "error"; message: string }
  | { type: "installing" }
  | { type: "update-available"; version: string }
  | { type: "update-downloaded"; version: string }
  | { type: "update-not-available" }

export function createDesktopUpdaterState(
  currentVersion: string,
  isPackaged: boolean
): DesktopUpdaterState {
  return {
    availableVersion: null,
    codex: {
      currentVersion: null,
      error: null,
      includedVersion: null,
    },
    currentVersion,
    error: null,
    progress: null,
    status: isPackaged ? "idle" : "disabled",
  }
}

export function reduceDesktopUpdaterState(
  state: DesktopUpdaterState,
  event: DesktopUpdaterEvent
): DesktopUpdaterState {
  if (event.type === "codex-current")
    return {
      ...state,
      codex: {
        ...state.codex,
        currentVersion: event.version,
        error: null,
      },
    }
  if (event.type === "codex-error")
    return {
      ...state,
      codex: { ...state.codex, error: event.message },
    }
  if (event.type === "codex-included")
    return {
      ...state,
      codex: {
        ...state.codex,
        error: null,
        includedVersion: event.version,
      },
    }
  if (event.type === "checking")
    return {
      ...state,
      codex: { ...state.codex, error: null, includedVersion: null },
      error: null,
      progress: null,
      status: "checking",
    }
  if (event.type === "update-not-available")
    return {
      ...state,
      availableVersion: null,
      codex: { ...state.codex, includedVersion: null },
      error: null,
      progress: null,
      status: "up-to-date",
    }
  if (event.type === "update-available")
    return {
      ...state,
      availableVersion: event.version,
      codex: { ...state.codex, includedVersion: null },
      error: null,
      progress: null,
      status: "update-available",
    }
  if (event.type === "download-started")
    return { ...state, error: null, progress: 0, status: "downloading" }
  if (event.type === "download-progress")
    return {
      ...state,
      error: null,
      progress: Math.max(0, Math.min(event.progress, 100)),
      status: "downloading",
    }
  if (event.type === "update-downloaded")
    return {
      ...state,
      availableVersion: event.version,
      error: null,
      progress: 100,
      status: "ready-to-install",
    }
  if (event.type === "installing")
    return { ...state, error: null, status: "installing" }
  return {
    ...state,
    error: event.message,
    progress: null,
    status: "error",
  }
}

export function canCheckForDesktopUpdates(state: DesktopUpdaterState) {
  return ![
    "checking",
    "disabled",
    "downloading",
    "installing",
    "ready-to-install",
  ].includes(state.status)
}

export function canDownloadDesktopUpdate(state: DesktopUpdaterState) {
  return state.status === "update-available" && Boolean(state.availableVersion)
}

export function canInstallDesktopUpdate(state: DesktopUpdaterState) {
  return state.status === "ready-to-install"
}
