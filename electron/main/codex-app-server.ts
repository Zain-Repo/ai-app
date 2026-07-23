import { app, shell } from "electron"
import { spawn } from "node:child_process"
import type { ChildProcessWithoutNullStreams } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"

import type {
  DesktopCodexAccount,
  DesktopCodexGenerateInput,
  DesktopCodexGenerateResult,
  DesktopCodexModel,
} from "../types"

type JsonObject = Record<string, unknown>
type PendingRequest = {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
}

const LOGIN_TIMEOUT_MS = 10 * 60_000
const REQUEST_TIMEOUT_MS = 30_000
const TURN_TIMEOUT_MS = 10 * 60_000

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function targetTriple() {
  if (process.platform === "win32" && process.arch === "x64")
    return "x86_64-pc-windows-msvc"
  if (process.platform === "win32" && process.arch === "arm64")
    return "aarch64-pc-windows-msvc"
  if (process.platform === "darwin" && process.arch === "x64")
    return "x86_64-apple-darwin"
  if (process.platform === "darwin" && process.arch === "arm64")
    return "aarch64-apple-darwin"
  if (process.platform === "linux" && process.arch === "x64")
    return "x86_64-unknown-linux-musl"
  if (process.platform === "linux" && process.arch === "arm64")
    return "aarch64-unknown-linux-musl"
  throw new Error(`Codex is unavailable on ${process.platform}-${process.arch}`)
}

function resolveCodexExecutable() {
  const override = process.env.AI_HARNESS_CODEX_PATH?.trim()
  if (override) return override

  const executableName = process.platform === "win32" ? "codex.exe" : "codex"
  const candidates = [
    path.join(process.resourcesPath, targetTriple(), "bin", executableName),
    path.join(
      app.getAppPath(),
      "node_modules",
      `@openai/codex-${process.platform}-${process.arch}`,
      "vendor",
      targetTriple(),
      "bin",
      executableName
    ),
  ]
  const packaged = candidates.find((candidate) => fs.existsSync(candidate))
  if (packaged) return packaged

  return process.platform === "win32" ? "codex.exe" : "codex"
}

function trustedLoginUrl(value: unknown): value is string {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      ["auth.openai.com", "chatgpt.com"].includes(url.hostname)
    )
  } catch {
    return false
  }
}

export class CodexAppServer {
  private child: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private notificationWaiters = new Set<{
    method: string
    predicate: (value: JsonObject) => boolean
    reject: (error: Error) => void
    resolve: (value: JsonObject) => void
  }>()
  private pending = new Map<number, PendingRequest>()

  async account(): Promise<DesktopCodexAccount> {
    const result = await this.request("account/read", { refreshToken: false })
    if (!isRecord(result) || !isRecord(result.account))
      return { connected: false, email: null, planType: null }
    return {
      connected: result.account.type === "chatgpt",
      email:
        typeof result.account.email === "string" ? result.account.email : null,
      planType:
        typeof result.account.planType === "string"
          ? result.account.planType
          : null,
    }
  }

  async login(): Promise<DesktopCodexAccount> {
    const result = await this.request("account/login/start", {
      type: "chatgpt",
      useHostedLoginSuccessPage: true,
      appBrand: "chatgpt",
    })
    if (
      !isRecord(result) ||
      typeof result.loginId !== "string" ||
      !trustedLoginUrl(result.authUrl)
    )
      throw new Error("Codex did not return a trusted login URL")

    const completion = this.waitForNotification(
      "account/login/completed",
      (params) => params.loginId === result.loginId,
      LOGIN_TIMEOUT_MS
    )
    await shell.openExternal(result.authUrl)
    const completed = await completion
    if (completed.success !== true)
      throw new Error(
        typeof completed.error === "string"
          ? completed.error
          : "ChatGPT sign-in did not complete"
      )
    return await this.account()
  }

  async logout() {
    await this.request("account/logout")
  }

  async listModels(): Promise<DesktopCodexModel[]> {
    const result = await this.request("model/list", {
      includeHidden: false,
      limit: 100,
    })
    if (!isRecord(result) || !Array.isArray(result.data)) return []
    return result.data.flatMap((entry) => {
      if (
        !isRecord(entry) ||
        typeof entry.model !== "string" ||
        typeof entry.displayName !== "string"
      )
        return []
      const efforts = Array.isArray(entry.supportedReasoningEfforts)
        ? entry.supportedReasoningEfforts.flatMap((option) =>
            isRecord(option) && typeof option.effort === "string"
              ? [option.effort]
              : []
          )
        : []
      return [
        {
          value: entry.model,
          label: entry.displayName,
          ...(typeof entry.description === "string"
            ? { description: entry.description }
            : {}),
          ...(efforts.length ? { reasoningEfforts: efforts } : {}),
          ...(typeof entry.defaultReasoningEffort === "string"
            ? { defaultReasoningEffort: entry.defaultReasoningEffort }
            : {}),
        },
      ]
    })
  }

  async generate(
    input: DesktopCodexGenerateInput
  ): Promise<DesktopCodexGenerateResult> {
    if (!(await this.account()).connected)
      throw new Error("Sign in with ChatGPT before using Codex")
    if (!input.model || input.model.length > 200)
      throw new Error("Codex model is unavailable")
    if (input.messages.length === 0 || input.messages.length > 200)
      throw new Error("Conversation context is unavailable")

    const transcript = input.messages
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join("\n\n")
    if (transcript.length > 200_000)
      throw new Error("Conversation context is too long")

    const workspace = path.join(app.getPath("userData"), "codex-workspace")
    fs.mkdirSync(workspace, { recursive: true })
    const threadResult = await this.request("thread/start", {
      model: input.model,
      cwd: workspace,
      approvalPolicy: "never",
      sandbox: "read-only",
      ephemeral: true,
      developerInstructions:
        input.developerInstructions?.slice(0, 16_000) ||
        "You are a general-purpose assistant in AI Harness. Answer directly. Do not inspect files, run commands, or modify the filesystem.",
    })
    const thread = isRecord(threadResult) ? threadResult.thread : null
    if (!isRecord(thread) || typeof thread.id !== "string")
      throw new Error("Codex could not start a conversation")

    const turnResult = await this.request("turn/start", {
      threadId: thread.id,
      input: [{ type: "text", text: transcript, text_elements: [] }],
      model: input.model,
      ...(input.effort ? { effort: input.effort } : {}),
    })
    const turn = isRecord(turnResult) ? turnResult.turn : null
    if (!isRecord(turn) || typeof turn.id !== "string")
      throw new Error("Codex could not start a response")

    const completed = await this.waitForNotification(
      "turn/completed",
      (params) => {
        const completedTurn = params.turn
        return (
          params.threadId === thread.id &&
          isRecord(completedTurn) &&
          completedTurn.id === turn.id
        )
      },
      TURN_TIMEOUT_MS
    )
    const completedTurn = isRecord(completed.turn) ? completed.turn : null
    if (!completedTurn || completedTurn.status !== "completed") {
      const error =
        completedTurn && isRecord(completedTurn.error)
          ? completedTurn.error.message
          : null
      throw new Error(
        typeof error === "string" ? error : "Codex response failed"
      )
    }

    const items = Array.isArray(completedTurn.items) ? completedTurn.items : []
    const content = items
      .flatMap((item) =>
        isRecord(item) &&
        item.type === "agentMessage" &&
        typeof item.text === "string"
          ? [item.text]
          : []
      )
      .join("\n\n")
      .trim()
    const reasoningSteps = items.flatMap((item) =>
      isRecord(item) && item.type === "reasoning" && Array.isArray(item.summary)
        ? item.summary.filter(
            (part): part is string => typeof part === "string"
          )
        : []
    )
    if (!content) throw new Error("Codex returned an empty response")
    return { content, reasoningSteps }
  }

  async stop() {
    const child = this.child
    this.child = null
    if (!child || child.killed) return
    child.kill()
  }

  private async ensureStarted() {
    if (this.child && !this.child.killed) return
    const codexHome = path.join(app.getPath("userData"), "codex")
    fs.mkdirSync(codexHome, { recursive: true })
    const child = spawn(resolveCodexExecutable(), ["app-server", "--stdio"], {
      cwd: app.getPath("userData"),
      env: { ...process.env, CODEX_HOME: codexHome },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    })
    this.child = child
    child.once("error", (error) => this.rejectAll(error))
    child.once("exit", () =>
      this.rejectAll(new Error("Codex app-server stopped unexpectedly"))
    )
    readline
      .createInterface({ input: child.stdout })
      .on("line", (line) => this.handleLine(line))
    readline.createInterface({ input: child.stderr }).on("line", (line) => {
      if (line.trim()) console.warn(`[codex] ${line}`)
    })
    await this.requestWithoutStart("initialize", {
      clientInfo: {
        name: "ai_harness",
        title: "AI Harness",
        version: app.getVersion(),
      },
      capabilities: {
        experimentalApi: false,
        requestAttestation: false,
      },
    })
    child.stdin.write(
      `${JSON.stringify({ method: "initialized", params: {} })}\n`
    )
  }

  private handleLine(line: string) {
    let message: unknown
    try {
      message = JSON.parse(line)
    } catch {
      return
    }
    if (!isRecord(message)) return
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (isRecord(message.error))
        pending.reject(
          new Error(
            typeof message.error.message === "string"
              ? message.error.message
              : "Codex request failed"
          )
        )
      else pending.resolve(message.result)
      return
    }
    if (typeof message.method !== "string" || !isRecord(message.params)) return
    for (const waiter of [...this.notificationWaiters]) {
      if (
        waiter.method === message.method &&
        waiter.predicate(message.params)
      ) {
        this.notificationWaiters.delete(waiter)
        waiter.resolve(message.params)
      }
    }
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
    for (const waiter of this.notificationWaiters) waiter.reject(error)
    this.notificationWaiters.clear()
    this.child = null
  }

  private async request(method: string, params?: unknown) {
    await this.ensureStarted()
    return await this.requestWithoutStart(method, params)
  }

  private requestWithoutStart(method: string, params?: unknown) {
    const child = this.child
    if (!child || child.killed)
      return Promise.reject(new Error("Codex app-server is unavailable"))
    const id = this.nextId++
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Codex ${method} request timed out`))
      }, REQUEST_TIMEOUT_MS)
      timeout.unref()
      this.pending.set(id, {
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
        resolve: (value) => {
          clearTimeout(timeout)
          resolve(value)
        },
      })
      child.stdin.write(
        `${JSON.stringify({
          method,
          id,
          ...(params === undefined ? {} : { params }),
        })}\n`,
        (error) => {
          if (!error) return
          this.pending.delete(id)
          clearTimeout(timeout)
          reject(error)
        }
      )
    })
  }

  private waitForNotification(
    method: string,
    predicate: (value: JsonObject) => boolean,
    timeoutMs: number
  ) {
    return new Promise<JsonObject>((resolve, reject) => {
      const waiter = { method, predicate, reject, resolve }
      this.notificationWaiters.add(waiter)
      const timeout = setTimeout(() => {
        this.notificationWaiters.delete(waiter)
        reject(new Error(`Timed out waiting for ${method}`))
      }, timeoutMs)
      timeout.unref()
      const originalResolve = waiter.resolve
      const originalReject = waiter.reject
      waiter.resolve = (value) => {
        clearTimeout(timeout)
        originalResolve(value)
      }
      waiter.reject = (error) => {
        clearTimeout(timeout)
        originalReject(error)
      }
    })
  }
}
