import { contextBridge, ipcRenderer } from "electron"

import type {
  AiHarnessDesktopApi,
  DesktopCodexGenerateInput,
  DesktopUpdaterState,
} from "../types"

const api: AiHarnessDesktopApi = {
  isDesktop: true,
  version: () => ipcRenderer.invoke("desktop:version"),
  codex: {
    account: () => ipcRenderer.invoke("desktop:codex-account"),
    login: () => ipcRenderer.invoke("desktop:codex-login"),
    logout: () => ipcRenderer.invoke("desktop:codex-logout"),
    listModels: () => ipcRenderer.invoke("desktop:codex-models"),
    generate: (input: DesktopCodexGenerateInput) =>
      ipcRenderer.invoke("desktop:codex-generate", input),
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

contextBridge.exposeInMainWorld("aiHarnessDesktop", api)
