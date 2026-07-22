import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "./_generated/dataModel"
import { createTerminalSandboxSession } from "./terminalSandbox"
import { normalizeTerminalWorkingDirectory } from "../shared/terminal-workspace"

const conversationId = "conversation-id" as Id<"conversations">
const projectId = "project-id" as Id<"projects">
const workerToken = "x".repeat(32)

afterEach(() => {
  vi.restoreAllMocks()
})

describe("normalizeTerminalWorkingDirectory", () => {
  it("normalizes relative paths below the workspace root", () => {
    expect(normalizeTerminalWorkingDirectory()).toBe("/workspace")
    expect(normalizeTerminalWorkingDirectory("src/../tests")).toBe(
      "/workspace/tests"
    )
    expect(normalizeTerminalWorkingDirectory("/workspace/src/./lib")).toBe(
      "/workspace/src/lib"
    )
  })

  it("rejects paths that can escape the workspace root", () => {
    expect(() => normalizeTerminalWorkingDirectory("../secrets")).toThrow(
      "inside /workspace"
    )
    expect(() => normalizeTerminalWorkingDirectory("/etc")).toThrow(
      "inside /workspace"
    )
    expect(() => normalizeTerminalWorkingDirectory("src\\outside")).toThrow(
      "unavailable"
    )
  })
})

describe("createTerminalSandboxSession", () => {
  it("does not expose a sandbox when the worker is not configured", () => {
    expect(createTerminalSandboxSession({ conversationId })).toBeUndefined()
  })

  it("rejects incomplete or insecure worker configuration", () => {
    expect(() =>
      createTerminalSandboxSession({
        conversationId,
        workerUrl: "https://terminal.example.com",
      })
    ).toThrow("incomplete")
    expect(() =>
      createTerminalSandboxSession({
        conversationId,
        workerToken,
        workerUrl: "http://terminal.example.com",
      })
    ).toThrow("invalid")
  })

  it("delegates project commands to the authenticated worker", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ exitCode: 0, stderr: "", stdout: "/workspace\n" }),
          { status: 200 }
        )
      )
    const sandbox = createTerminalSandboxSession({
      conversationId,
      projectId,
      workerToken,
      workerUrl: "https://terminal.example.com/",
    })

    const result = await sandbox?.run({
      command: "pwd",
      workingDirectory: "src/..",
    })

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "/workspace\n",
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://terminal.example.com/v1/workspaces/execute")
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${workerToken}`,
      "content-type": "application/json",
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      command: "pwd",
      workingDirectory: "/workspace",
      workspace: { key: projectId, scope: "project" },
    })
  })

  it("rejects command environment injection", async () => {
    const sandbox = createTerminalSandboxSession({
      conversationId,
      workerToken,
      workerUrl: "https://terminal.example.com",
    })

    await expect(
      sandbox?.run({ command: "env", env: { TOKEN: "not-allowed" } })
    ).rejects.toThrow("not allowed")
  })
})
