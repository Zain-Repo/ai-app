import { v } from "convex/values"

export const terminalRunValidator = v.object({
  command: v.string(),
  durationMs: v.optional(v.number()),
  exitCode: v.optional(v.number()),
  stderr: v.optional(v.string()),
  stdout: v.optional(v.string()),
  status: v.union(
    v.literal("running"),
    v.literal("complete"),
    v.literal("failed")
  ),
  toolCallId: v.string(),
  workingDirectory: v.optional(v.string()),
})

export type StoredTerminalRun = {
  command: string
  durationMs?: number
  exitCode?: number
  stderr?: string
  stdout?: string
  status: "running" | "complete" | "failed"
  toolCallId: string
  workingDirectory?: string
}

const MAX_TERMINAL_RUNS = 6
const MAX_TERMINAL_OUTPUT_LENGTH = 12_000

function tail(value: string) {
  return value.length <= MAX_TERMINAL_OUTPUT_LENGTH
    ? value
    : `[earlier output truncated]\n${value.slice(
        -MAX_TERMINAL_OUTPUT_LENGTH + 27
      )}`
}

export function startTerminalRun(
  runs: StoredTerminalRun[],
  run: Omit<StoredTerminalRun, "status">
) {
  return [...runs, { ...run, status: "running" as const }].slice(
    -MAX_TERMINAL_RUNS
  )
}

export function finishTerminalRun(
  runs: StoredTerminalRun[],
  toolCallId: string,
  result: {
    durationMs: number
    exitCode?: number
    stderr?: string
    stdout?: string
    status: "complete" | "failed"
  }
) {
  return runs.map((run) =>
    run.toolCallId === toolCallId
      ? {
          ...run,
          ...result,
          ...(result.stderr ? { stderr: tail(result.stderr) } : {}),
          ...(result.stdout ? { stdout: tail(result.stdout) } : {}),
        }
      : run
  )
}
