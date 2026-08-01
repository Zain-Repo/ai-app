import { v } from "convex/values"

export const memoryModeValidator = v.union(
  v.literal("standard"),
  v.literal("read_only"),
  v.literal("off")
)

export const memoryScopeValidator = v.union(
  v.literal("user"),
  v.literal("project")
)

export const memoryCategoryValidator = v.union(
  v.literal("core_profile"),
  v.literal("preference"),
  v.literal("fact"),
  v.literal("workstyle")
)

export const memoryStatusValidator = v.union(
  v.literal("active"),
  v.literal("candidate"),
  v.literal("needs_review"),
  v.literal("archived"),
  v.literal("removed")
)

export const memorySourceSignalValidator = v.union(
  v.literal("manual"),
  v.literal("direct_statement"),
  v.literal("history_candidate"),
  v.literal("inferred")
)

export const memoryConfirmationValidator = v.union(
  v.literal("confirmed"),
  v.literal("pending")
)

export const memorySensitivityValidator = v.union(
  v.literal("normal"),
  v.literal("sensitive")
)

export type MemoryMode = "standard" | "read_only" | "off"
export type MemoryScope = "user" | "project"
export type MemoryCategory =
  | "core_profile"
  | "preference"
  | "fact"
  | "workstyle"
export type MemorySourceSignal =
  | "manual"
  | "direct_statement"
  | "history_candidate"
  | "inferred"

export const MAX_ACTIVE_MEMORY_ITEMS = 100
export const MAX_RETRIEVED_MEMORY_ITEMS = 8
export const MEMORY_CONTEXT_TOKEN_BUDGET = 2_000
export const MEMORY_UNDO_WINDOW_MS = 30_000
export const MEMORY_TOMBSTONE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
export const MEMORY_CANDIDATE_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000
export const MEMORY_REVIEW_AFTER_MS = 180 * 24 * 60 * 60 * 1_000

export function getMemoryScopeKey(
  scope: MemoryScope,
  projectId?: string
) {
  if (scope === "user") return "user"
  if (!projectId) throw new Error("Project memory requires a project")
  return `project:${projectId}`
}

export function getMemorySearchScope(ownerId: string, scopeKey: string) {
  return `${ownerId}:${scopeKey}`
}

// This is an opaque, deterministic identifier for a deletion guard. It is not
// used for authorization or cryptography, so it deliberately never exposes
// the canonical key in the tombstone row.
export function createMemoryTombstoneHash(
  ownerId: string,
  scopeKey: string,
  canonicalKey: string
) {
  let hash = 0x811c9dc5
  const input = `${ownerId}\u0000${scopeKey}\u0000${canonicalKey}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

export function estimateMemoryTokens(content: string) {
  return Math.max(1, Math.ceil(content.length / 4))
}
