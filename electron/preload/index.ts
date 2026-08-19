import { contextBridge, ipcRenderer } from "electron"

import type {
  Dev3DesktopApi,
  DesktopCodexDelta,
  DesktopCodexGenerateInput,
  DesktopUpdaterState,
} from "../types"

function isDesktopCodexDelta(value: unknown): value is DesktopCodexDelta {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const delta = value as Record<string, unknown>
  return (
    typeof delta.delta === "string" &&
    Boolean(delta.delta) &&
    typeof delta.itemId === "string" &&
    Boolean(delta.itemId) &&
    (delta.phase === null ||
      delta.phase === "commentary" ||
      delta.phase === "final_answer")
  )
}

const api: Dev3DesktopApi = {
  isDesktop: true,
  version: () => ipcRenderer.invoke("desktop:version"),
  codex: {
    account: () => ipcRenderer.invoke("desktop:codex-account"),
    cancel: (requestId: string) =>
      ipcRenderer.invoke("desktop:codex-cancel", requestId),
    login: () => ipcRenderer.invoke("desktop:codex-login"),
    logout: () => ipcRenderer.invoke("desktop:codex-logout"),
    listModels: () => ipcRenderer.invoke("desktop:codex-models"),
    generate: async (
      input: DesktopCodexGenerateInput,
      onDelta?: (delta: DesktopCodexDelta) => void,
      suppliedRequestId?: string
    ) => {
      const requestId = suppliedRequestId ?? crypto.randomUUID()
      const handler = (
        _event: Electron.IpcRendererEvent,
        progressRequestId: unknown,
        delta: unknown
      ) => {
        if (progressRequestId === requestId && isDesktopCodexDelta(delta))
          onDelta?.(delta)
      }
      ipcRenderer.on("desktop:codex-delta", handler)
      try {
        return await ipcRenderer.invoke(
          "desktop:codex-generate",
          requestId,
          input
        )
      } finally {
        ipcRenderer.removeListener("desktop:codex-delta", handler)
      }
    },
  },
  cursor: {
    account: () => ipcRenderer.invoke("desktop:cursor-account"),
    login: () => ipcRenderer.invoke("desktop:cursor-login"),
    logout: () => ipcRenderer.invoke("desktop:cursor-logout"),
  },
  updater: {
    getState: () => ipcRenderer.invoke("desktop:updater-get-state"),
    check: () => ipcRenderer.invoke("desktop:updater-check"),
    download: () => ipcRenderer.invoke("desktop:updater-download"),
    install: () => ipcRenderer.invoke("desktop:updater-install"),
    onState: (callback: (state: DesktopUpdaterState) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        state: DesktopUpdaterState
      ) => callback(state)
      ipcRenderer.on("desktop:updater-state", handler)
      return () => ipcRenderer.removeListener("desktop:updater-state", handler)
    },
  },
}

contextBridge.exposeInMainWorld("dev3Desktop", api)
// Keep older remotely deployed renderers functional during the upgrade window.
contextBridge.exposeInMainWorld("aiHarnessDesktop", api)
