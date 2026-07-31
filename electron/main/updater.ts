import { app } from "electron"
import type { BrowserWindow } from "electron"
import log from "electron-log/main"
import { autoUpdater } from "electron-updater"
import type { ProgressInfo, UpdateInfo } from "electron-updater"
import fs from "node:fs"
import path from "node:path"

import { fetchReleaseCodexVersion } from "./codex-runtime"
import {
  DEFAULT_BACKGROUND_CHECK_INTERVAL_MS,
  initialDesktopUpdaterCheckDelay,
  normalizeDesktopUpdaterScheduleState,
} from "./updater-schedule"
import type { DesktopUpdaterScheduleState } from "./updater-schedule"
import {
  canCheckForDesktopUpdates,
  canDownloadDesktopUpdate,
  canInstallDesktopUpdate,
  createDesktopUpdaterState,
  reduceDesktopUpdaterState,
} from "./updater-state"
import type { DesktopUpdaterEvent } from "./updater-state"

export class DesktopUpdater {
  private automaticCheckTimer: NodeJS.Timeout | null = null
  private backgroundCheckTimer: NodeJS.Timeout | null = null
  private isAutomaticCheckRunning = false
  private schedule: DesktopUpdaterScheduleState = {
    lastCheckedAt: null,
    launchCount: 0,
  }
  private readonly schedulePath = path.join(
    app.getPath("userData"),
    "updater-schedule.json"
  )
  private state = createDesktopUpdaterState(
    app.getVersion(),
    app.isPackaged,
    process.windowsStore
  )

  constructor(
    private readonly window: BrowserWindow,
    private readonly codex: {
      getVersion: () => Promise<string>
      stop: () => Promise<void>
    }
  ) {
    if (process.windowsStore) return
    log.initialize()
    autoUpdater.logger = log
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.autoRunAppAfterInstall = true
    this.schedule = this.loadSchedule()
    this.schedule = {
      ...this.schedule,
      launchCount: this.schedule.launchCount + 1,
    }
    this.persistSchedule()
    autoUpdater.on("checking-for-update", () =>
      this.apply({ type: "checking" })
    )
    autoUpdater.on("update-available", (info: UpdateInfo) =>
      this.apply({ type: "update-available", version: info.version })
    )
    autoUpdater.on("update-not-available", () =>
      this.apply({ type: "update-not-available" })
    )
    autoUpdater.on("download-progress", (progress: ProgressInfo) =>
      this.apply({ progress: progress.percent, type: "download-progress" })
    )
    autoUpdater.on("update-downloaded", (info: UpdateInfo) =>
      this.apply({ type: "update-downloaded", version: info.version })
    )
    autoUpdater.on("error", (error: Error) =>
      this.apply({ message: error.message, type: "error" })
    )
  }

  getState() {
    return { ...this.state }
  }

  startAutomaticChecks() {
    if (
      !app.isPackaged ||
      process.windowsStore ||
      this.automaticCheckTimer ||
      this.backgroundCheckTimer
    )
      return

    const initialDelayMs = initialDesktopUpdaterCheckDelay(
      this.schedule,
      Date.now()
    )
    this.automaticCheckTimer = setTimeout(() => {
      this.automaticCheckTimer = null
      void this.runAutomaticCheck()
      this.backgroundCheckTimer = setInterval(
        () => void this.runAutomaticCheck(),
        DEFAULT_BACKGROUND_CHECK_INTERVAL_MS
      )
      this.backgroundCheckTimer.unref()
    }, initialDelayMs)
    this.automaticCheckTimer.unref()
  }

  stopAutomaticChecks() {
    if (this.automaticCheckTimer) {
      clearTimeout(this.automaticCheckTimer)
      this.automaticCheckTimer = null
    }
    if (this.backgroundCheckTimer) {
      clearInterval(this.backgroundCheckTimer)
      this.backgroundCheckTimer = null
    }
  }

  async check() {
    if (!app.isPackaged || !canCheckForDesktopUpdates(this.state))
      return this.getState()
    try {
      this.apply({ type: "checking" })
      this.recordCheck()
      try {
        this.apply({
          type: "codex-current",
          version: await this.codex.getVersion(),
        })
      } catch (error) {
        this.apply({
          message: this.errorMessage(error, "Codex version could not be read."),
          type: "codex-error",
        })
      }
      const result = await autoUpdater.checkForUpdates()
      if (
        result?.updateInfo.version &&
        this.state.status === "update-available"
      )
        try {
          this.apply({
            type: "codex-included",
            version: await fetchReleaseCodexVersion(result.updateInfo.version),
          })
        } catch (error) {
          this.apply({
            message: this.errorMessage(
              error,
              "Codex details are unavailable for this app update."
            ),
            type: "codex-error",
          })
        }
    } catch (error) {
      this.apply({ message: this.errorMessage(error), type: "error" })
    }
    return this.getState()
  }

  async download() {
    if (!app.isPackaged || !canDownloadDesktopUpdate(this.state))
      return this.getState()
    try {
      this.apply({ type: "download-started" })
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.apply({ message: this.errorMessage(error), type: "error" })
    }
    return this.getState()
  }

  async install() {
    if (!canInstallDesktopUpdate(this.state)) return this.getState()
    this.apply({ type: "installing" })
    try {
      await this.codex.stop()
      autoUpdater.quitAndInstall(false, true)
    } catch (error) {
      this.apply({ message: this.errorMessage(error), type: "error" })
    }
    return this.getState()
  }

  private apply(event: DesktopUpdaterEvent) {
    this.state = reduceDesktopUpdaterState(this.state, event)
    if (!this.window.isDestroyed()) {
      if (this.state.status === "downloading")
        this.window.setProgressBar(
          Math.max((this.state.progress ?? 0) / 100, 0.01)
        )
      else if (this.state.status === "installing") this.window.setProgressBar(2)
      else this.window.setProgressBar(-1)
      this.window.webContents.send("desktop:updater-state", this.state)
    }
  }

  private async runAutomaticCheck() {
    if (this.isAutomaticCheckRunning) return
    this.isAutomaticCheckRunning = true
    try {
      await this.check()
    } finally {
      this.isAutomaticCheckRunning = false
    }
  }

  private loadSchedule() {
    try {
      if (!fs.existsSync(this.schedulePath))
        return normalizeDesktopUpdaterScheduleState(null)
      return normalizeDesktopUpdaterScheduleState(
        JSON.parse(fs.readFileSync(this.schedulePath, "utf8"))
      )
    } catch (error) {
      log.warn(`Unable to read updater schedule: ${this.errorMessage(error)}`)
      return normalizeDesktopUpdaterScheduleState(null)
    }
  }

  private persistSchedule() {
    try {
      fs.mkdirSync(path.dirname(this.schedulePath), { recursive: true })
      fs.writeFileSync(
        this.schedulePath,
        `${JSON.stringify(this.schedule, null, 2)}\n`,
        "utf8"
      )
    } catch (error) {
      log.warn(
        `Unable to persist updater schedule: ${this.errorMessage(error)}`
      )
    }
  }

  private recordCheck() {
    this.schedule = {
      ...this.schedule,
      lastCheckedAt: new Date().toISOString(),
    }
    this.persistSchedule()
  }

  private errorMessage(
    error: unknown,
    fallback = "The updater encountered an unexpected error."
  ) {
    return error instanceof Error && error.message.trim()
      ? error.message
      : fallback
  }
}
