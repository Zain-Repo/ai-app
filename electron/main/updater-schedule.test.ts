import { describe, expect, it } from "vitest"

import {
  DEFAULT_BACKGROUND_CHECK_INTERVAL_MS,
  DEFAULT_STARTUP_CHECK_COOLDOWN_MS,
  DEFAULT_STARTUP_CHECK_DELAY_MS,
  initialDesktopUpdaterCheckDelay,
  normalizeDesktopUpdaterScheduleState,
} from "./updater-schedule"

describe("desktop updater automatic-check schedule", () => {
  it("delays a first automatic check until the regular interval", () => {
    expect(
      initialDesktopUpdaterCheckDelay(
        { lastCheckedAt: null, launchCount: 1 },
        Date.UTC(2026, 6, 31)
      )
    ).toBe(DEFAULT_BACKGROUND_CHECK_INTERVAL_MS)
  })

  it("honors the persisted cooldown before checking after later launches", () => {
    const now = Date.UTC(2026, 6, 31, 12)
    expect(
      initialDesktopUpdaterCheckDelay(
        { lastCheckedAt: new Date(now - 60_000).toISOString(), launchCount: 2 },
        now
      )
    ).toBe(DEFAULT_STARTUP_CHECK_COOLDOWN_MS - 60_000)
  })

  it("uses the startup delay when a previous check is no longer cooling down", () => {
    const now = Date.UTC(2026, 6, 31, 12)
    expect(
      initialDesktopUpdaterCheckDelay(
        {
          lastCheckedAt: new Date(now - 8 * 60 * 60 * 1_000).toISOString(),
          launchCount: 2,
        },
        now
      )
    ).toBe(DEFAULT_STARTUP_CHECK_DELAY_MS)
  })

  it("rejects malformed persisted scheduler state", () => {
    expect(
      normalizeDesktopUpdaterScheduleState({
        lastCheckedAt: "not-a-date",
        launchCount: -1,
      })
    ).toEqual({ lastCheckedAt: null, launchCount: 0 })
  })
})
