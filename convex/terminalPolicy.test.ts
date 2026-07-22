import { describe, expect, it } from "vitest"

import { finishTerminalRun, startTerminalRun } from "./terminalPolicy"

describe("terminal run persistence", () => {
  it("bounds history and stored output", () => {
    let runs = Array.from({ length: 7 }, (_, index) => index).reduce(
      (current, index) =>
        startTerminalRun(current, {
          command: `echo ${index}`,
          toolCallId: String(index),
        }),
      [] as ReturnType<typeof startTerminalRun>
    )

    expect(runs).toHaveLength(6)
    expect(runs[0]?.toolCallId).toBe("1")
    runs = finishTerminalRun(runs, "6", {
      durationMs: 12,
      exitCode: 0,
      status: "complete",
      stdout: "x".repeat(20_000),
    })
    expect(runs.at(-1)).toMatchObject({
      durationMs: 12,
      exitCode: 0,
      status: "complete",
    })
    expect(runs.at(-1)?.stdout?.length).toBeLessThanOrEqual(12_000)
  })
})
