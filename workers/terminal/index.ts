import { createHash, timingSafeEqual } from "node:crypto"
import { createServer } from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"

import {
  terminalDeleteRequestSchema,
  terminalExecuteRequestSchema,
} from "../../shared/terminal-workspace"
import { resolveTerminalSandboxImage } from "./config"
import { TerminalRuntime } from "./runtime"

const MAX_REQUEST_BYTES = 32 * 1_024
const token = process.env.TERMINAL_WORKER_TOKEN
const image = resolveTerminalSandboxImage(process.env.TERMINAL_SANDBOX_IMAGE)
const host = process.env.TERMINAL_WORKER_HOST ?? "127.0.0.1"
const port = Number(process.env.TERMINAL_WORKER_PORT ?? 8788)

if (!token || token.length < 32)
  throw new Error("TERMINAL_WORKER_TOKEN must contain at least 32 characters")
if (!Number.isInteger(port) || port < 1 || port > 65_535)
  throw new Error("TERMINAL_WORKER_PORT is invalid")
const workerToken = token

const runtime = new TerminalRuntime({
  dockerBin: process.env.TERMINAL_DOCKER_BIN,
  image,
  runtime: process.env.TERMINAL_CONTAINER_RUNTIME ?? "runsc",
  stateDirectory: process.env.TERMINAL_WORKER_STATE_DIR,
  token: workerToken,
})
await runtime.initialize()

function authorized(header: string | undefined) {
  const received = header?.startsWith("Bearer ") ? header.slice(7) : ""
  const expectedDigest = createHash("sha256").update(workerToken).digest()
  const receivedDigest = createHash("sha256").update(received).digest()
  return timingSafeEqual(expectedDigest, receivedDigest)
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > MAX_REQUEST_BYTES) throw new Error("Request body is too large")
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  })
  response.end(JSON.stringify(body))
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      const healthy = await runtime.health()
      sendJson(response, healthy ? 200 : 503, { healthy })
      return
    }
    if (
      request.method !== "POST" ||
      !authorized(request.headers.authorization)
    ) {
      sendJson(response, 404, { error: "Not found" })
      return
    }

    if (request.url === "/v1/workspaces/execute") {
      const body = terminalExecuteRequestSchema.parse(await readJson(request))
      const controller = new AbortController()
      const onClose = () => {
        if (!response.writableEnded)
          controller.abort(new Error("Client disconnected"))
      }
      response.once("close", onClose)
      try {
        const result = await runtime.execute(body, controller.signal)
        sendJson(response, 200, result)
      } finally {
        response.removeListener("close", onClose)
      }
      return
    }

    if (request.url === "/v1/workspaces/delete") {
      const body = terminalDeleteRequestSchema.parse(await readJson(request))
      await runtime.deleteWorkspace(body.workspace)
      sendJson(response, 200, { deleted: true })
      return
    }

    sendJson(response, 404, { error: "Not found" })
  } catch {
    if (!response.headersSent)
      sendJson(response, 400, { error: "Terminal worker request failed" })
    else response.destroy()
  }
})

const janitor = setInterval(() => {
  void runtime.reapIdleWorkspaces().catch(() => undefined)
}, 60_000)
janitor.unref()

server.listen(port, host, () => {
  console.log(`Terminal worker listening on ${host}:${port}`)
})
