import { app, BrowserWindow, ipcMain, Menu, shell } from "electron"
import type { IpcMainInvokeEvent } from "electron"
import fs from "node:fs"
import path from "node:path"

import type { DesktopCodexGenerateInput } from "../types"
import { CodexAppServer } from "./codex-app-server"
import { CursorCli } from "./cursor-cli"
import {
  desktopEntryUrl,
  isAllowedDesktopAuthNavigation,
  isAllowedDesktopNavigation,
} from "./desktop-navigation"
import { DesktopUpdater } from "./updater"

type DesktopConfig = { rendererUrl?: unknown }

const CODEX_REASONING_EFFORTS = new Set([
  "high",
  "low",
  "max",
  "medium",
  "minimal",
  "none",
  "xhigh",
])

const codex = new CodexAppServer()
const cursor = new CursorCli()
let mainWindow: BrowserWindow | null = null
let authWindow: BrowserWindow | null = null
let updater: DesktopUpdater | null = null

function readPackagedRendererUrl() {
  const configPath = path.join(process.resourcesPath, "desktop-config.json")
  if (!fs.existsSync(configPath)) return null
  const parsed = JSON.parse(
    fs.readFileSync(configPath, "utf8")
  ) as DesktopConfig
  return typeof parsed.rendererUrl === "string" ? parsed.rendererUrl : null
}

function rendererUrl() {
  const configured = process.env.AI_HARNESS_DESKTOP_URL?.trim()
  const value =
    configured || (app.isPackaged ? readPackagedRendererUrl() : null)
  return value || "http://127.0.0.1:3000"
}

function parsedRendererUrl() {
  const url = new URL(rendererUrl())
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("AI_HARNESS_DESKTOP_URL must use http or https")
  if (app.isPackaged && url.protocol !== "https:")
    throw new Error("Packaged desktop builds require an https renderer URL")
  return url
}

function assertTrustedSender(event: IpcMainInvokeEvent) {
  const senderUrl = event.senderFrame?.url || event.sender.getURL()
  if (!isAllowedDesktopNavigation(senderUrl, parsedRendererUrl().origin))
    throw new Error("Desktop request came from an untrusted page")
}

function handle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertTrustedSender(event)
    return await handler(event, ...args)
  })
}

function isCodexGenerateInput(
  value: unknown
): value is DesktopCodexGenerateInput {
  if (!value || typeof value !== "object") return false
  const input = value as Record<string, unknown>
  return (
    typeof input.model === "string" &&
    (input.effort === undefined ||
      (typeof input.effort === "string" &&
        CODEX_REASONING_EFFORTS.has(input.effort))) &&
    (input.developerInstructions === undefined ||
      typeof input.developerInstructions === "string") &&
    Array.isArray(input.messages) &&
    input.messages.every(
      (message) =>
        message &&
        typeof message === "object" &&
        typeof (message as Record<string, unknown>).content === "string" &&
        ["assistant", "system", "user"].includes(
          String((message as Record<string, unknown>).role)
        )
    )
  )
}

function registerIpc() {
  handle("desktop:version", () => app.getVersion())
  handle("desktop:codex-account", () => codex.account())
  handle("desktop:codex-login", () => codex.login())
  handle("desktop:codex-logout", () => codex.logout())
  handle("desktop:codex-models", () => codex.listModels())
  handle("desktop:codex-generate", (_event, value) => {
    if (!isCodexGenerateInput(value)) throw new Error("Invalid Codex request")
    return codex.generate(value)
  })
  handle("desktop:cursor-account", () => cursor.account())
  handle("desktop:cursor-login", () => cursor.login())
  handle("desktop:cursor-logout", () => cursor.logout())
  handle("desktop:updater-get-state", () => updater?.getState())
  handle("desktop:updater-check", () => updater?.check())
  handle("desktop:updater-download", () => updater?.download())
  handle("desktop:updater-install", () => updater?.install())
}

async function waitForRenderer(url: URL) {
  if (app.isPackaged) return
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) return
    } catch {
      // The development server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Renderer did not start at ${url.origin}`)
}

function openDesktopAuthWindow(
  parent: BrowserWindow,
  target: string,
  rendererOrigin: string
) {
  if (authWindow && !authWindow.isDestroyed()) {
    authWindow.focus()
    void authWindow.loadURL(target)
    return
  }

  const window = new BrowserWindow({
    parent,
    modal: true,
    show: false,
    width: 560,
    height: 760,
    minWidth: 420,
    minHeight: 600,
    title: "Sign in to AI Harness",
    autoHideMenuBar: true,
    backgroundColor: "#070807",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: parent.webContents.session,
    },
  })
  authWindow = window

  const completeAuthentication = (callbackUrl: string) => {
    void parent.loadURL(callbackUrl)
    if (!window.isDestroyed()) window.close()
  }

  const handleNavigation = (
    event: Electron.Event,
    navigationTarget: string
  ) => {
    if (isAllowedDesktopNavigation(navigationTarget, rendererOrigin)) {
      event.preventDefault()
      completeAuthentication(navigationTarget)
      return
    }
    if (isAllowedDesktopAuthNavigation(navigationTarget)) return

    event.preventDefault()
    try {
      const parsed = new URL(navigationTarget)
      if (["http:", "https:"].includes(parsed.protocol))
        void shell.openExternal(parsed.toString())
    } catch {
      // Invalid and non-web URLs remain blocked.
    }
  }

  window.webContents.on("will-navigate", handleNavigation)
  window.webContents.on("will-redirect", handleNavigation)
  window.webContents.on("did-navigate", (_event, navigationTarget) => {
    if (isAllowedDesktopNavigation(navigationTarget, rendererOrigin))
      completeAuthentication(navigationTarget)
  })
  window.webContents.setWindowOpenHandler(({ url: navigationTarget }) => {
    if (
      isAllowedDesktopAuthNavigation(navigationTarget) ||
      isAllowedDesktopNavigation(navigationTarget, rendererOrigin)
    ) {
      void window.loadURL(navigationTarget)
    } else {
      try {
        const parsed = new URL(navigationTarget)
        if (["http:", "https:"].includes(parsed.protocol))
          void shell.openExternal(parsed.toString())
      } catch {
        // Invalid and non-web URLs remain blocked.
      }
    }
    return { action: "deny" }
  })
  window.once("ready-to-show", () => window.show())
  window.on("closed", () => {
    if (authWindow === window) authWindow = null
  })
  void window.loadURL(target).catch(() => {
    if (!window.isDestroyed()) window.close()
  })
}

async function createWindow() {
  const renderer = parsedRendererUrl()
  await waitForRenderer(renderer)
  const url = desktopEntryUrl(renderer)
  Menu.setApplicationMenu(null)
  const window = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "AI Harness",
    autoHideMenuBar: true,
    backgroundColor: "#070807",
    ...(!app.isPackaged
      ? { icon: path.join(app.getAppPath(), "public", "favicon.ico") }
      : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
    },
  })
  mainWindow = window
  updater = new DesktopUpdater(window, {
    getVersion: () => codex.version(),
    stop: () => codex.stop(),
  })

  window.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isAllowedDesktopAuthNavigation(target)) {
      openDesktopAuthWindow(window, target, url.origin)
      return { action: "deny" }
    }
    try {
      const parsed = new URL(target)
      if (["http:", "https:"].includes(parsed.protocol))
        void shell.openExternal(parsed.toString())
    } catch {
      // Invalid and non-web URLs remain blocked.
    }
    return { action: "deny" }
  })
  window.webContents.on("will-navigate", (event, target) => {
    if (!isAllowedDesktopNavigation(target, url.origin)) {
      event.preventDefault()
      if (isAllowedDesktopAuthNavigation(target)) {
        openDesktopAuthWindow(window, target, url.origin)
        return
      }
      void window.loadURL(url.toString())
    }
  })
  window.webContents.on(
    "did-navigate-in-page",
    (_event, target, isMainFrame) => {
      if (isMainFrame && !isAllowedDesktopNavigation(target, url.origin))
        void window.loadURL(url.toString())
    }
  )
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null
  })
  await window.loadURL(url.toString())
  if (app.isPackaged && !process.windowsStore)
    setTimeout(
      () => void updater?.check().catch(() => undefined),
      30_000
    ).unref()
}

if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on("second-instance", () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
  app.whenReady().then(async () => {
    registerIpc()
    await createWindow()
  })
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
  app.on("before-quit", () => void codex.stop())
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit()
  })
}
