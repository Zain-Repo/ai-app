"use node"

import { tool } from "ai"
import type { Experimental_SandboxSession } from "ai"
import { z } from "zod"

import type { Id } from "./_generated/dataModel"
import {
  normalizeTerminalWorkingDirectory,
  terminalDeleteRequestSchema,
  terminalExecuteRequestSchema,
  terminalExecuteResponseSchema,
} from "../shared/terminal-workspace"
import type { TerminalWorkspace } from "../shared/terminal-workspace"

const TERMINAL_REQUEST_TIMEOUT_MS = 130_000

function normalizeWorkerUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("Terminal worker URL is invalid")
  }

  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Terminal worker URL is invalid")

  return url.toString().replace(/\/$/, "")
}

async function requestWorker(
  workerUrl: string,
  workerToken: string,
  path: string,
  body: unknown,
  abortSignal?: AbortSignal
) {
  const controller = new AbortController()
  const timeout = setTimeout(
    () => controller.abort(new Error("Terminal worker timed out")),
    TERMINAL_REQUEST_TIMEOUT_MS
  )
  const onAbort = () => controller.abort(abortSignal?.reason)
  abortSignal?.addEventListener("abort", onAbort, { once: true })
  try {
    const response = await fetch(`${workerUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${workerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error("Terminal worker request failed")
    return await response.json()
  } finally {
    clearTimeout(timeout)
    abortSignal?.removeEventListener("abort", onAbort)
  }
}

function unavailableFileOperation(): never {
  throw new Error("File operations are not enabled for this terminal session")
}

export function createTerminalSandboxSession(args: {
  conversationId: Id<"conversations">
  projectId?: Id<"projects">
  workerToken?: string
  workerUrl?: string
}): Experimental_SandboxSession | undefined {
  if (!args.workerToken && !args.workerUrl) return undefined
  if (!args.workerToken || !args.workerUrl)
    throw new Error("Terminal worker configuration is incomplete")

  const workerUrl = normalizeWorkerUrl(args.workerUrl)
  const workerToken = args.workerToken
  const workspace: TerminalWorkspace = args.projectId
    ? { key: args.projectId, scope: "project" }
    : { key: args.conversationId, scope: "chat" }
  const description = args.projectId
    ? "A persistent project terminal is available at /workspace. It has no network access and is shared by chats in this project."
    : "A disposable terminal is available at /workspace. It has no network access and expires after 30 minutes of inactivity."

  return {
    description,
    readFile: async () => unavailableFileOperation(),
    readBinaryFile: async () => unavailableFileOperation(),
    readTextFile: async () => unavailableFileOperation(),
    writeFile: async () => unavailableFileOperation(),
    writeBinaryFile: async () => unavailableFileOperation(),
    writeTextFile: async () => unavailableFileOperation(),
    spawn: async () => unavailableFileOperation(),
    run: async (options) => {
      if (options.env && Object.keys(options.env).length)
        throw new Error("Terminal environment injection is not allowed")
      const request = terminalExecuteRequestSchema.parse({
        command: options.command,
        workingDirectory: normalizeTerminalWorkingDirectory(
          options.workingDirectory
        ),
        workspace,
      })
      const result = await requestWorker(
        workerUrl,
        workerToken,
        "/v1/workspaces/execute",
        request,
        options.abortSignal
      )
      return terminalExecuteResponseSchema.parse(result)
    },
  }
}

export const runTerminalCommandInputSchema = z.object({
  command: z.string().min(1).max(8_000),
  workingDirectory: z.string().min(1).max(512).optional(),
})

export const runTerminalCommandTool = tool({
  description:
    "Run a non-interactive shell command in the isolated terminal workspace. The command runs with bounded resources, no network access, and no secrets.",
  inputSchema: runTerminalCommandInputSchema,
  execute: async (input, options) => {
    if (!options.experimental_sandbox)
      throw new Error("Terminal workspace is unavailable")
    return await options.experimental_sandbox.run({
      ...input,
      abortSignal: options.abortSignal,
    })
  },
})

export async function deleteTerminalWorkspace(args: {
  workerToken?: string
  workerUrl?: string
  workspace: TerminalWorkspace
}) {
  if (!args.workerToken && !args.workerUrl) return
  if (!args.workerToken || !args.workerUrl)
    throw new Error("Terminal worker configuration is incomplete")
  const body = terminalDeleteRequestSchema.parse({ workspace: args.workspace })
  await requestWorker(
    normalizeWorkerUrl(args.workerUrl),
    args.workerToken,
    "/v1/workspaces/delete",
    body
  )
}
