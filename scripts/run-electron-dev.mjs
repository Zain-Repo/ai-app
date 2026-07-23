import { spawn } from "node:child_process"

const processes = [
  spawn("bun", ["run", "dev", "--", "--host", "127.0.0.1"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
  spawn("bunx", ["electron-forge", "start"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  }),
]

let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of processes) child.kill()
  process.exitCode = code
}

for (const child of processes) {
  child.on("exit", (code) => stop(code ?? 1))
  child.on("error", () => stop(1))
}
process.on("SIGINT", () => stop(130))
process.on("SIGTERM", () => stop(143))
