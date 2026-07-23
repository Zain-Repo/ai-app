import { app } from "electron"
import type { BrowserWindow } from "electron"
import log from "electron-log/main"
import { autoUpdater } from "electron-updater"
import type { ProgressInfo, UpdateInfo } from "electron-updater"

import type { DesktopUpdaterState } from "../types"

export class DesktopUpdater {
  private state: DesktopUpdaterState = {
    availableVersion: null,
    currentVersion: app.getVersion(),
    error: null,
    progress: null,
    status: app.isPackaged ? "idle" : "disabled",
  }

  constructor(private readonly window: BrowserWindow) {
    log.initialize()
    autoUpdater.logger = log
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on("checking-for-update", () =>
      this.update({ status: "checking" })
    )
    autoUpdater.on("update-available", (info: UpdateInfo) =>
      this.update({ availableVersion: info.version, status: "idle" })
    )
    autoUpdater.on("update-not-available", () =>
      this.update({ availableVersion: null, status: "up-to-date" })
    )
    autoUpdater.on("download-progress", (progress: ProgressInfo) =>
      this.update({ progress: progress.percent, status: "downloading" })
    )
    autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
      this.update({
        availableVersion: info.version,
        progress: 100,
        status: "ready",
      })
    )
    autoUpdater.on("error", (error: Error) =>
      this.update({ error: error.message, status: "error" })
    )
  }

  getState() {
    return this.state
  }

  async check() {
    if (!app.isPackaged) return this.state
    await autoUpdater.checkForUpdates()
    return this.state
  }

  async download() {
    if (!app.isPackaged) return this.state
    await autoUpdater.downloadUpdate()
    return this.state
  }

  install() {
    if (this.state.status === "ready") autoUpdater.quitAndInstall(false, true)
  }

  private update(patch: Partial<DesktopUpdaterState>) {
    this.state = { ...this.state, ...patch, error: patch.error ?? null }
    if (!this.window.isDestroyed())
      this.window.webContents.send("desktop:updater-state", this.state)
  }
}
