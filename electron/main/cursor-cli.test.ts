import { execFile } from "node:child_process"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { describe, expect, it } from "vitest"

import {
  CursorCli,
  cursorCommandInvocation,
  cursorIsAuthenticated,
  resolveCursorCommand,
} from "./cursor-cli"

const localAppData = "C:\\Users\\developer\\AppData\\Local"
const execFileAsync = promisify(execFile)

describe("Cursor CLI command resolution", () => {
  it("discovers the current Windows agent launcher before the legacy launcher", () => {
    const agentLauncher = path.win32.join(
      localAppData,
      "cursor-agent",
      "agent.cmd"
    )
    const checked: string[] = []

    expect(
      resolveCursorCommand({
        environment: { LOCALAPPDATA: localAppData },
        exists: (candidate) => {
          checked.push(candidate)
          return candidate === agentLauncher
        },
        platform: "win32",
      })
    ).toEqual({ file: agentLauncher, kind: "windows-batch" })
    expect(checked).toEqual([
      path.win32.join(localAppData, "cursor-agent", "agent.exe"),
      agentLauncher,
    ])
  })

  it("keeps an explicit Cursor path ahead of discovery", () => {
    expect(
      resolveCursorCommand({
        environment: {
          AI_HARNESS_CURSOR_PATH: "D:\\Cursor Agent\\cursor-agent.cmd",
          LOCALAPPDATA: localAppData,
        },
        exists: () => false,
        platform: "win32",
      })
    ).toEqual({
      file: "D:\\Cursor Agent\\cursor-agent.cmd",
      kind: "windows-batch",
    })
  })

  it("reads mixed-case environment names and quoted PATH directories", () => {
    const pathDirectory = "C:\\Cursor Agent\\bin"
    const agentExecutable = path.win32.join(pathDirectory, "agent.exe")

    expect(
      resolveCursorCommand({
        environment: { pAtH: `"${pathDirectory}"` },
        exists: (candidate) => candidate === agentExecutable,
        platform: "win32",
      })
    ).toEqual({ file: agentExecutable, kind: "direct" })
  })

  it("runs Windows batch launchers through cmd.exe instead of execFile directly", () => {
    expect(
      cursorCommandInvocation(
        {
          file: "C:\\Cursor Agent\\agent.cmd",
          kind: "windows-batch",
        },
        ["login"],
        "C:\\Windows\\System32\\cmd.exe"
      )
    ).toEqual({
      args: ["/d", "/s", "/c", '""C:\\Cursor Agent\\agent.cmd" login"'],
      file: "C:\\Windows\\System32\\cmd.exe",
      windowsVerbatimArguments: true,
    })
  })

  it.runIf(process.platform === "win32")(
    "executes a batch launcher whose path contains spaces",
    async () => {
      const tempDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), "cursor cli ")
      )
      const launcher = path.join(tempDirectory, "cursor agent.cmd")

      await fs.writeFile(launcher, "@echo off\r\necho Not logged in\r\n")

      try {
        const invocation = cursorCommandInvocation(
          { file: launcher, kind: "windows-batch" },
          ["status"]
        )
        const { stdout } = await execFileAsync(
          invocation.file,
          invocation.args,
          {
            windowsHide: true,
            windowsVerbatimArguments: invocation.windowsVerbatimArguments,
          }
        )

        expect(stdout).toContain("Not logged in")
      } finally {
        await fs.rm(tempDirectory, { force: true, recursive: true })
      }
    }
  )

  it("uses direct executables and retains the non-Windows cursor-agent fallback", () => {
    expect(
      cursorCommandInvocation({ file: "/opt/cursor-agent", kind: "direct" }, [
        "status",
      ])
    ).toEqual({ args: ["status"], file: "/opt/cursor-agent" })
    expect(
      resolveCursorCommand({
        environment: {},
        platform: "linux",
      })
    ).toEqual({ file: "cursor-agent", kind: "direct" })
  })

  it("keeps status disconnected while login and logout explain a missing CLI", async () => {
    const cli = new CursorCli({
      environment: {},
      exists: () => false,
      platform: "win32",
    })

    await expect(cli.account()).resolves.toEqual({ connected: false })
    await expect(cli.login()).rejects.toThrow("Cursor Agent CLI was not found")
    await expect(cli.logout()).rejects.toThrow("Cursor Agent CLI was not found")
  })
})

describe("Cursor CLI status", () => {
  it("does not treat an unauthenticated CLI as connected", () => {
    expect(cursorIsAuthenticated("Not authenticated")).toBe(false)
    expect(cursorIsAuthenticated("Unauthenticated")).toBe(false)
    expect(cursorIsAuthenticated("")).toBe(false)
    expect(cursorIsAuthenticated("Signed in as developer@example.com")).toBe(
      true
    )
  })
})
