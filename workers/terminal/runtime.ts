import { createHmac } from "node:crypto"
import { spawn } from "node:child_process"
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  MAX_TERMINAL_OUTPUT_LENGTH,
  normalizeTerminalWorkingDirectory,
} from "../../shared/terminal-workspace"
import type {
  TerminalExecuteRequest,
  TerminalWorkspace,
} from "../../shared/terminal-workspace"

type ProcessResult = {
  exitCode: number
  stderr: string
  stdout: string
}

type WorkspaceState = {
  containerName: string
  lastUsedAt: number
  scope: TerminalWorkspace["scope"]
  volumeName: string
}

type TerminalRuntimeOptions = {
  chatIdleMs?: number
  commandTimeoutMs?: number
  dockerBin?: string
  image: string
  projectStopIdleMs?: number
  runtime?: string
  stateDirectory?: string
  token: string
}

const OUTPUT_TRUNCATED_MARKER = "[earlier output truncated]\n"

function appendTail(current: string, chunk: Buffer) {
  const next = current + chunk.toString("utf8")
  if (next.length <= MAX_TERMINAL_OUTPUT_LENGTH) return next
  return (
    OUTPUT_TRUNCATED_MARKER +
    next.slice(-(MAX_TERMINAL_OUTPUT_LENGTH - OUTPUT_TRUNCATED_MARKER.length))
  )
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback
  return parsed
}

export class TerminalRuntime {
  readonly chatIdleMs: number
  readonly commandTimeoutMs: number
  readonly dockerBin: string
  readonly image: string
  readonly projectStopIdleMs: number
  readonly runtime: string
  readonly stateDirectory: string

  private readonly locks = new Map<string, Promise<void>>()
  private readonly token: string

  constructor(options: TerminalRuntimeOptions) {
    this.chatIdleMs =
      options.chatIdleMs ??
      parsePositiveInteger(process.env.TERMINAL_CHAT_IDLE_MS, 30 * 60_000)
    this.commandTimeoutMs =
      options.commandTimeoutMs ??
      parsePositiveInteger(process.env.TERMINAL_COMMAND_TIMEOUT_MS, 120_000)
    this.dockerBin = options.dockerBin ?? "docker"
    this.image = options.image
    this.projectStopIdleMs =
      options.projectStopIdleMs ??
      parsePositiveInteger(
        process.env.TERMINAL_PROJECT_STOP_IDLE_MS,
        10 * 60_000
      )
    this.runtime = options.runtime ?? "runsc"
    this.stateDirectory =
      options.stateDirectory ??
      // Preserve the directory so pre-rebrand resources remain janitor-managed.
      path.join(os.tmpdir(), "ai-harness-terminal-worker")
    this.token = options.token
  }

  async initialize() {
    await mkdir(this.stateDirectory, { recursive: true })
  }

  async health() {
    const [info, image] = await Promise.all([
      this.runDocker(["info", "--format", "{{json .Runtimes}}"]),
      this.runDocker(["image", "inspect", this.image]),
    ])
    if (info.exitCode !== 0 || image.exitCode !== 0) return false
    try {
      const runtimes = JSON.parse(info.stdout) as Record<string, unknown>
      return Object.hasOwn(runtimes, this.runtime)
    } catch {
      return false
    }
  }

  async execute(request: TerminalExecuteRequest, signal?: AbortSignal) {
    const identity = this.getIdentity(request.workspace)
    return await this.withWorkspaceLock(identity.containerName, async () => {
      await this.ensureWorkspace(request.workspace, identity)

      const workingDirectory = normalizeTerminalWorkingDirectory(
        request.workingDirectory
      )
      const controller = new AbortController()
      const timeout = setTimeout(
        () => controller.abort(new Error("Command timed out")),
        this.commandTimeoutMs + 10_000
      )
      const onAbort = () => controller.abort(signal?.reason)
      signal?.addEventListener("abort", onAbort, { once: true })
      if (signal?.aborted) controller.abort(signal.reason)

      try {
        const timeoutSeconds = Math.max(
          1,
          Math.ceil(this.commandTimeoutMs / 1_000)
        )
        const result = await this.runDocker(
          [
            "exec",
            "--workdir",
            workingDirectory,
            "--user",
            "1000:1000",
            identity.containerName,
            "timeout",
            "--foreground",
            "--signal=TERM",
            "--kill-after=5s",
            `${timeoutSeconds}s`,
            "/bin/bash",
            "-lc",
            request.command,
          ],
          controller.signal
        )
        await this.writeState({
          ...identity,
          lastUsedAt: Date.now(),
          scope: request.workspace.scope,
        })
        return result
      } catch (cause) {
        if (controller.signal.aborted)
          await this.stopContainer(identity.containerName)
        throw cause
      } finally {
        clearTimeout(timeout)
        signal?.removeEventListener("abort", onAbort)
      }
    })
  }

  async deleteWorkspace(workspace: TerminalWorkspace) {
    const identity = this.getIdentity(workspace)
    await this.withWorkspaceLock(identity.containerName, async () => {
      await this.removeContainer(identity.containerName)
      await this.runDocker(["volume", "rm", "--force", identity.volumeName])
      await rm(this.statePath(identity.containerName), { force: true })
    })
  }

  async reapIdleWorkspaces(now = Date.now()) {
    const states = await this.readStates()
    for (const state of states) {
      await this.withWorkspaceLock(state.containerName, async () => {
        const current = await this.readState(state.containerName)
        if (!current) return
        const idleMs = now - current.lastUsedAt
        if (current.scope === "chat" && idleMs >= this.chatIdleMs) {
          await this.removeContainer(current.containerName)
          await this.runDocker(["volume", "rm", "--force", current.volumeName])
          await rm(this.statePath(current.containerName), { force: true })
        } else if (
          current.scope === "project" &&
          idleMs >= this.projectStopIdleMs
        ) {
          await this.runDocker(["stop", "--time", "5", current.containerName])
        }
      })
    }
  }

  private async ensureWorkspace(
    workspace: TerminalWorkspace,
    identity: Pick<WorkspaceState, "containerName" | "volumeName">
  ) {
    const volume = await this.runDocker([
      "volume",
      "inspect",
      identity.volumeName,
    ])
    if (volume.exitCode !== 0) {
      const created = await this.runDocker([
        "volume",
        "create",
        identity.volumeName,
      ])
      if (created.exitCode !== 0)
        throw new Error("Terminal workspace could not be created")
    }

    const inspected = await this.runDocker([
      "inspect",
      "--format",
      "{{.State.Running}}",
      identity.containerName,
    ])
    if (inspected.exitCode !== 0) {
      const created = await this.runDocker([
        "create",
        "--name",
        identity.containerName,
        "--runtime",
        this.runtime,
        "--init",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges:true",
        "--pids-limit",
        "256",
        "--ulimit",
        "fsize=536870912:536870912",
        "--ulimit",
        "nofile=1024:1024",
        "--memory",
        "1g",
        "--cpus",
        "1",
        "--network",
        "none",
        "--user",
        "1000:1000",
        "--env",
        "HOME=/workspace",
        "--env",
        "TMPDIR=/tmp",
        "--label",
        "dev3.terminal=true",
        "--label",
        `dev3.scope=${workspace.scope}`,
        "--mount",
        `type=volume,src=${identity.volumeName},dst=/workspace`,
        "--tmpfs",
        "/tmp:rw,nosuid,nodev,noexec,size=67108864",
        this.image,
        "sleep",
        "infinity",
      ])
      if (created.exitCode !== 0) {
        await this.runDocker(["volume", "rm", "--force", identity.volumeName])
        throw new Error("Terminal sandbox could not be created")
      }
    }

    if (inspected.stdout.trim() !== "true") {
      const started = await this.runDocker(["start", identity.containerName])
      if (started.exitCode !== 0)
        throw new Error("Terminal sandbox could not be started")
    }
    await this.writeState({
      ...identity,
      lastUsedAt: Date.now(),
      scope: workspace.scope,
    })
  }

  private getIdentity(workspace: TerminalWorkspace) {
    const digest = createHmac("sha256", this.token)
      .update(`${workspace.scope}:${workspace.key}`)
      .digest("hex")
      .slice(0, 32)
    return {
      containerName: `aih-terminal-${digest}`,
      volumeName: `aih-terminal-data-${digest}`,
    }
  }

  private async runDocker(args: string[], signal?: AbortSignal) {
    return await new Promise<ProcessResult>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error("Terminal command was cancelled"))
        return
      }
      const child = spawn(this.dockerBin, args, {
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })
      let stdout = ""
      let stderr = ""
      const onAbort = () => child.kill("SIGKILL")
      signal?.addEventListener("abort", onAbort, { once: true })
      child.stdout.on("data", (chunk: Buffer) => {
        stdout = appendTail(stdout, chunk)
      })
      child.stderr.on("data", (chunk: Buffer) => {
        stderr = appendTail(stderr, chunk)
      })
      child.once("error", reject)
      child.once("close", (code) => {
        signal?.removeEventListener("abort", onAbort)
        if (signal?.aborted) {
          reject(signal.reason ?? new Error("Terminal command was cancelled"))
          return
        }
        resolve({ exitCode: code ?? -1, stderr, stdout })
      })
    })
  }

  private async stopContainer(containerName: string) {
    await this.removeContainer(containerName)
  }

  private async removeContainer(containerName: string) {
    await this.runDocker(["rm", "--force", containerName])
  }

  private statePath(containerName: string) {
    return path.join(this.stateDirectory, `${containerName}.json`)
  }

  private async writeState(state: WorkspaceState) {
    const target = this.statePath(state.containerName)
    const temporary = `${target}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(state), { mode: 0o600 })
    await rename(temporary, target)
  }

  private async readStates() {
    const names = await readdir(this.stateDirectory)
    const states: WorkspaceState[] = []
    for (const name of names) {
      if (!name.endsWith(".json")) continue
      try {
        const parsed = JSON.parse(
          await readFile(path.join(this.stateDirectory, name), "utf8")
        ) as Partial<WorkspaceState>
        if (
          typeof parsed.containerName === "string" &&
          parsed.containerName === name.slice(0, -5) &&
          /^aih-terminal-[a-f0-9]{32}$/.test(parsed.containerName) &&
          typeof parsed.volumeName === "string" &&
          /^aih-terminal-data-[a-f0-9]{32}$/.test(parsed.volumeName) &&
          typeof parsed.lastUsedAt === "number" &&
          (parsed.scope === "chat" || parsed.scope === "project")
        )
          states.push(parsed as WorkspaceState)
      } catch {
        // Ignore corrupt metadata; never infer a Docker resource name from it.
      }
    }
    return states
  }

  private async readState(containerName: string) {
    try {
      const parsed = JSON.parse(
        await readFile(this.statePath(containerName), "utf8")
      ) as Partial<WorkspaceState>
      return typeof parsed.containerName === "string" &&
        parsed.containerName === containerName &&
        /^aih-terminal-[a-f0-9]{32}$/.test(parsed.containerName) &&
        typeof parsed.volumeName === "string" &&
        /^aih-terminal-data-[a-f0-9]{32}$/.test(parsed.volumeName) &&
        typeof parsed.lastUsedAt === "number" &&
        (parsed.scope === "chat" || parsed.scope === "project")
        ? (parsed as WorkspaceState)
        : null
    } catch {
      return null
    }
  }

  private async withWorkspaceLock<T>(name: string, task: () => Promise<T>) {
    const previous = this.locks.get(name) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => gate)
    this.locks.set(name, tail)
    await previous
    try {
      return await task()
    } finally {
      release()
      if (this.locks.get(name) === tail) this.locks.delete(name)
    }
  }
}
