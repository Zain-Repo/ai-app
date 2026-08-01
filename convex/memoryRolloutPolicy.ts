export type MemoryV2RolloutMode = "off" | "shadow" | "enabled"

// Unset deployments shadow-read only. This keeps the legacy context as the
// response path until an operator explicitly enables v2.
export function getMemoryV2RolloutMode(value: string | undefined): MemoryV2RolloutMode {
  if (value === "enabled") return "enabled"
  if (value === "off") return "off"
  return "shadow"
}

// Capture can share extraction work across rollout modes, but the persistence
// target is deliberately explicit: `off` leaves only legacy records,
// `shadow` preserves parity, and `enabled` cuts over to v2 records.
export function getMemoryCaptureStoragePlan(mode: MemoryV2RolloutMode) {
  return {
    writeLegacy: mode !== "enabled",
    writeV2: mode !== "off",
  }
}
