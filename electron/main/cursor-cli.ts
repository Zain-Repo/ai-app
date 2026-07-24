import { execFile } from "node:child_process"

import type { DesktopCursorAccount } from "../types"

const COMMAND_TIMEOUT_MS = 15_000
const LOGIN_TIMEOUT_MS = 10 * 60_000

function executable() {
  return process.env.AI_HARNESS_CURSOR_PATH?.trim() || "cursor-agent"
}

function run(args: string[], timeout = COMMAND_TIMEOUT_MS) {
  return new Promise<{ stderr: string; stdout: string }>((resolve, reject) => {
    execFile(
      executable(),
      args,
      { maxBuffer: 16_384, timeout, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) reject(error)
        else resolve({ stderr, stdout })
      }
    )
  })
}

export function cursorIsAuthenticated(status: string) {
  return (
    !/not authenticated|unauthenticated|not logged in/i.test(status) &&
    /authenticated|logged in|signed in/i.test(status)
  )
}

export class CursorCli {
  async account(): Promise<DesktopCursorAccount> {
    try {
      const { stderr, stdout } = await run(["status"])
      return { connected: cursorIsAuthenticated(`${stdout}\n${stderr}`) }
    } catch {
      return { connected: false }
    }
  }

  async login(): Promise<DesktopCursorAccount> {
    await run(["login"], LOGIN_TIMEOUT_MS)
    const account = await this.account()
    if (!account.connected) throw new Error("Cursor sign-in did not complete")
    return account
  }

  async logout() {
    await run(["logout"])
  }
}
