import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import type { DesktopCursorAccount } from "../types"

const COMMAND_TIMEOUT_MS = 15_000
const LOGIN_TIMEOUT_MS = 10 * 60_000
const CURSOR_CLI_NOT_FOUND_MESSAGE =
  "Cursor Agent CLI was not found. Install Cursor Agent or set DEV3_CURSOR_PATH to its executable."

type CursorCliArgument = "login" | "logout" | "status"

export type CursorCliOptions = {
  environment?: NodeJS.ProcessEnv
  exists?: (candidate: string) => boolean
  platform?: NodeJS.Platform
}

export type CursorCommand =
  { file: string; kind: "direct" } | { file: string; kind: "windows-batch" }

type CursorCommandInvocation = {
  args: string[]
  file: string
  windowsVerbatimArguments?: boolean
}

class CursorCliNotFoundError extends Error {
  constructor() {
    super(CURSOR_CLI_NOT_FOUND_MESSAGE)
    this.name = "CursorCliNotFoundError"
  }
}

function environmentValue(environment: NodeJS.ProcessEnv, name: string) {
  const exactValue = environment[name]?.trim()
  if (exactValue) return exactValue

  const matchedName = Object.keys(environment).find(
    (key) => key.toUpperCase() === name.toUpperCase()
  )
  return matchedName ? environment[matchedName]?.trim() : undefined
}

function normalizeWindowsPathDirectory(directory: string) {
  const trimmed = directory.trim()
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1)
    : trimmed
}

function commandForFile(file: string): CursorCommand {
  return /\.(?:bat|cmd)$/i.test(file)
    ? { file, kind: "windows-batch" }
    : { file, kind: "direct" }
}

function windowsPathCandidates(
  environment: NodeJS.ProcessEnv,
  exists: (candidate: string) => boolean
) {
  const localAppData = environmentValue(environment, "LocalAppData")
  const launcherNames = [
    "agent.exe",
    "agent.cmd",
    "cursor-agent.exe",
    "cursor-agent.cmd",
  ]
  const candidates = localAppData
    ? launcherNames.map((name) =>
        path.win32.join(localAppData, "cursor-agent", name)
      )
    : []
  const pathValue = environmentValue(environment, "Path")

  if (pathValue) {
    for (const directory of pathValue.split(";")) {
      const normalizedDirectory = normalizeWindowsPathDirectory(directory)
      if (!normalizedDirectory) continue
      for (const launcherName of launcherNames)
        candidates.push(path.win32.join(normalizedDirectory, launcherName))
    }
  }

  return candidates.find(exists)
}

export function resolveCursorCommand({
  environment = process.env,
  exists = fs.existsSync,
  platform = process.platform,
}: CursorCliOptions = {}): CursorCommand {
  const override =
    environmentValue(environment, "DEV3_CURSOR_PATH") ||
    environmentValue(environment, "AI_HARNESS_CURSOR_PATH")
  if (override) return commandForFile(override)

  if (platform !== "win32") return { file: "cursor-agent", kind: "direct" }

  const discovered = windowsPathCandidates(environment, exists)
  if (discovered) return commandForFile(discovered)

  throw new CursorCliNotFoundError()
}

export function cursorCommandInvocation(
  command: CursorCommand,
  args: readonly CursorCliArgument[],
  commandProcessor = process.env.ComSpec?.trim() || "cmd.exe"
): CursorCommandInvocation {
  if (command.kind === "direct") return { args: [...args], file: command.file }

  if (command.file.includes('"')) throw new CursorCliNotFoundError()

  // cmd.exe needs a single quoted /c command when the launcher has spaces.
  // Prevent Node from backslash-escaping those embedded quotes before CMD sees it.
  const commandLine = `""${command.file}" ${args.join(" ")}"`
  return {
    args: ["/d", "/s", "/c", commandLine],
    file: commandProcessor,
    windowsVerbatimArguments: true,
  }
}

function errorCode(error: unknown) {
  if (!error || typeof error !== "object") return null
  const code = (error as { code?: unknown }).code
  return typeof code === "string" ? code : null
}

function actionableCursorError(error: unknown) {
  if (error instanceof CursorCliNotFoundError || errorCode(error) === "ENOENT")
    return new CursorCliNotFoundError()
  return error
}

export function cursorIsAuthenticated(status: string) {
  return (
    !/not authenticated|unauthenticated|not logged in/i.test(status) &&
    /authenticated|logged in|signed in/i.test(status)
  )
}

export class CursorCli {
  constructor(private readonly options: CursorCliOptions = {}) {}

  private run(args: CursorCliArgument[], timeout = COMMAND_TIMEOUT_MS) {
    const invocation = cursorCommandInvocation(
      resolveCursorCommand(this.options),
      args,
      environmentValue(this.options.environment ?? process.env, "ComSpec")
    )
    return new Promise<{ stderr: string; stdout: string }>(
      (resolve, reject) => {
        execFile(
          invocation.file,
          invocation.args,
          {
            maxBuffer: 16_384,
            timeout,
            windowsHide: true,
            windowsVerbatimArguments: invocation.windowsVerbatimArguments,
          },
          (error, stdout, stderr) => {
            if (error) reject(error)
            else resolve({ stderr, stdout })
          }
        )
      }
    )
  }

  async account(): Promise<DesktopCursorAccount> {
    try {
      const { stderr, stdout } = await this.run(["status"])
      return { connected: cursorIsAuthenticated(`${stdout}\n${stderr}`) }
    } catch {
      return { connected: false }
    }
  }

  async login(): Promise<DesktopCursorAccount> {
    try {
      await this.run(["login"], LOGIN_TIMEOUT_MS)
    } catch (error) {
      throw actionableCursorError(error)
    }
    const account = await this.account()
    if (!account.connected) throw new Error("Cursor sign-in did not complete")
    return account
  }

  async logout() {
    try {
      await this.run(["logout"])
    } catch (error) {
      throw actionableCursorError(error)
    }
  }
}
