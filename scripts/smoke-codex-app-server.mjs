import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import readline from "node:readline"

const triple =
  process.platform === "win32" && process.arch === "x64"
    ? "x86_64-pc-windows-msvc"
    : null
if (!triple)
  throw new Error("Desktop Codex smoke test currently targets Windows x64")

const executable = path.resolve(
  "node_modules",
  `@openai/codex-${process.platform}-${process.arch}`,
  "vendor",
  triple,
  "bin",
  "codex.exe"
)
if (!fs.existsSync(executable))
  throw new Error(`Codex binary missing: ${executable}`)

const codexHome = path.join(os.tmpdir(), `ai-harness-codex-${randomUUID()}`)
fs.mkdirSync(codexHome, { recursive: true })
let stderr = ""
const child = spawn(executable, ["app-server", "--stdio"], {
  env: {
    ...process.env,
    CODEX_HOME: codexHome,
    CODEX_MANAGED_BY_BUN: "1",
    CODEX_MANAGED_PACKAGE_ROOT: path.resolve(
      "node_modules",
      "@openai",
      "codex"
    ),
  },
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
})
const responses = new Map()
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8")
})
child.once("exit", (code) => {
  for (const reject of responses.values())
    reject({
      error: { message: `Codex exited with ${code}: ${stderr.trim()}` },
    })
  responses.clear()
})
const output = readline.createInterface({ input: child.stdout })
output.on("line", (line) => {
  const message = JSON.parse(line)
  if (typeof message.id === "number") responses.get(message.id)?.(message)
})

function request(id, method, params) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${method} timed out: ${stderr.trim()}`)),
      20_000
    )
    responses.set(id, (message) => {
      clearTimeout(timeout)
      responses.delete(id)
      if (message.error)
        reject(new Error(message.error.message || `${method} failed`))
      else resolve(message.result)
    })
    child.stdin.write(
      `${JSON.stringify({ id, method, ...(params ? { params } : {}) })}\n`
    )
  })
}

try {
  await request(1, "initialize", {
    clientInfo: {
      name: "ai_harness_smoke",
      title: "AI Harness",
      version: "0.1.0",
    },
    capabilities: { experimentalApi: false, requestAttestation: false },
  })
  child.stdin.write(
    `${JSON.stringify({ method: "initialized", params: {} })}\n`
  )
  const account = await request(2, "account/read", { refreshToken: false })
  if (!account || typeof account.requiresOpenaiAuth !== "boolean")
    throw new Error("Codex account response was invalid")
  console.log("Codex app-server initialized and accepted account/read")
} finally {
  if (child.exitCode === null) {
    const exited = new Promise((resolve) => child.once("exit", resolve))
    child.kill()
    await Promise.race([
      exited,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }
  output.close()
  fs.rmSync(codexHome, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  })
}
