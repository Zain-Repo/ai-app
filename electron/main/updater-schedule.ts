export type DesktopUpdaterScheduleState = {
  lastCheckedAt: string | null
  launchCount: number
}

export const DEFAULT_BACKGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1_000
export const DEFAULT_STARTUP_CHECK_COOLDOWN_MS = 6 * 60 * 60 * 1_000
export const DEFAULT_STARTUP_CHECK_DELAY_MS = 2 * 60 * 1_000

export function normalizeDesktopUpdaterScheduleState(
  value: unknown
): DesktopUpdaterScheduleState {
  if (!value || typeof value !== "object")
    return { lastCheckedAt: null, launchCount: 0 }

  const state = value as Record<string, unknown>
  const launchCount =
    typeof state.launchCount === "number" &&
    Number.isFinite(state.launchCount) &&
    state.launchCount >= 0
      ? Math.floor(state.launchCount)
      : 0
  const lastCheckedAt =
    typeof state.lastCheckedAt === "string" &&
    !Number.isNaN(Date.parse(state.lastCheckedAt))
      ? state.lastCheckedAt
      : null

  return { lastCheckedAt, launchCount }
}

export function initialDesktopUpdaterCheckDelay(
  schedule: DesktopUpdaterScheduleState,
  now: number,
  intervalMs = DEFAULT_BACKGROUND_CHECK_INTERVAL_MS,
  startupDelayMs = DEFAULT_STARTUP_CHECK_DELAY_MS,
  startupCooldownMs = DEFAULT_STARTUP_CHECK_COOLDOWN_MS
) {
  if (schedule.launchCount <= 1) return intervalMs
  if (!schedule.lastCheckedAt) return startupDelayMs

  const lastCheckedAtMs = Date.parse(schedule.lastCheckedAt)
  if (Number.isNaN(lastCheckedAtMs)) return startupDelayMs

  const remainingCooldownMs = Math.max(
    startupCooldownMs - (now - lastCheckedAtMs),
    0
  )
  return Math.max(startupDelayMs, remainingCooldownMs)
}
