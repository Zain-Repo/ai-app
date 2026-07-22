import { z } from "zod"

export const TERMINAL_WORKSPACE_ROOT = "/workspace"
export const MAX_TERMINAL_COMMAND_LENGTH = 8_000
export const MAX_TERMINAL_OUTPUT_LENGTH = 64 * 1_024

export const terminalWorkspaceSchema = z.object({
  key: z.string().min(1).max(200),
  scope: z.enum(["chat", "project"]),
})

export const terminalExecuteRequestSchema = z.object({
  command: z.string().min(1).max(MAX_TERMINAL_COMMAND_LENGTH),
  workingDirectory: z.string().min(1).max(512).optional(),
  workspace: terminalWorkspaceSchema,
})

export const terminalDeleteRequestSchema = z.object({
  workspace: terminalWorkspaceSchema,
})

export const terminalExecuteResponseSchema = z.object({
  exitCode: z.number().int(),
  stderr: z.string().max(MAX_TERMINAL_OUTPUT_LENGTH),
  stdout: z.string().max(MAX_TERMINAL_OUTPUT_LENGTH),
})

export type TerminalWorkspace = z.infer<typeof terminalWorkspaceSchema>
export type TerminalExecuteRequest = z.infer<
  typeof terminalExecuteRequestSchema
>

export function normalizeTerminalWorkingDirectory(value?: string) {
  const input = value?.trim() || TERMINAL_WORKSPACE_ROOT
  if (input.includes("\0") || input.includes("\\"))
    throw new Error("Working directory is unavailable")

  let relative: string
  if (input.startsWith("/")) {
    if (
      input !== TERMINAL_WORKSPACE_ROOT &&
      !input.startsWith(`${TERMINAL_WORKSPACE_ROOT}/`)
    )
      throw new Error("Working directory must stay inside /workspace")
    relative = input.slice(TERMINAL_WORKSPACE_ROOT.length)
  } else {
    relative = input
  }

  const segments: string[] = []
  for (const segment of relative.split("/")) {
    if (!segment || segment === ".") continue
    if (segment === "..") {
      if (!segments.length)
        throw new Error("Working directory must stay inside /workspace")
      segments.pop()
      continue
    }
    segments.push(segment)
  }

  return segments.length
    ? `${TERMINAL_WORKSPACE_ROOT}/${segments.join("/")}`
    : TERMINAL_WORKSPACE_ROOT
}
