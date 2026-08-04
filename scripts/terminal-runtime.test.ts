import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { TerminalRuntime } from "../workers/terminal/runtime"

describe("terminal worker state compatibility", () => {
  it("keeps the legacy default directory for existing workspace metadata", () => {
    const runtime = new TerminalRuntime({
      image: "dev3-terminal:test",
      token: "test-token",
    })

    expect(runtime.stateDirectory).toBe(
      path.join(os.tmpdir(), "ai-harness-terminal-worker")
    )
  })

  it("honors an explicitly configured state directory", () => {
    const stateDirectory = path.join(os.tmpdir(), "custom-terminal-worker")
    const runtime = new TerminalRuntime({
      image: "dev3-terminal:test",
      stateDirectory,
      token: "test-token",
    })

    expect(runtime.stateDirectory).toBe(stateDirectory)
  })
})
