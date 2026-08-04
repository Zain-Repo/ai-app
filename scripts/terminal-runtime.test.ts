import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { resolveTerminalSandboxImage } from "../workers/terminal/config"
import { TerminalRuntime } from "../workers/terminal/runtime"

describe("terminal worker state compatibility", () => {
  it("uses the legacy local image when hosts have no explicit override", () => {
    expect(resolveTerminalSandboxImage()).toBe("ai-harness-terminal:local")
  })

  it("honors an explicitly configured sandbox image", () => {
    expect(
      resolveTerminalSandboxImage("registry.example/dev3@sha256:test")
    ).toBe("registry.example/dev3@sha256:test")
  })

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
