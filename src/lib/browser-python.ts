const MAX_BROWSER_PYTHON_CODE_LENGTH = 32_000
const BROWSER_PYTHON_TIMEOUT_MS = 30_000

export type BrowserPythonResult = {
  error?: string
  stderr: string
  stdout: string
}

type BrowserPythonResponse = BrowserPythonResult & {
  error?: string
  type: "result"
}

export function executeBrowserPython(code: string) {
  if (!code.trim()) throw new Error("Python code is empty")
  if (code.length > MAX_BROWSER_PYTHON_CODE_LENGTH)
    throw new Error("Python code is too large to run in the browser")

  const worker = new Worker(
    new URL("../workers/browser-python.worker.ts", import.meta.url),
    { type: "module" }
  )
  let settled = false
  let rejectResult: (error: Error) => void = () => undefined
  const finish = () => {
    window.clearTimeout(timeout)
    worker.terminate()
  }
  const timeout = window.setTimeout(() => {
    if (settled) return
    settled = true
    worker.terminate()
    rejectResult(new Error("Browser Python stopped after 30 seconds"))
  }, BROWSER_PYTHON_TIMEOUT_MS)

  const result = new Promise<BrowserPythonResult>((resolve, reject) => {
    rejectResult = reject
    worker.onmessage = (event: MessageEvent<unknown>) => {
      const response = event.data as Partial<BrowserPythonResponse> | null
      if (
        settled ||
        response?.type !== "result" ||
        typeof response.stdout !== "string" ||
        typeof response.stderr !== "string"
      )
        return
      settled = true
      finish()
      resolve({
        ...(response.error ? { error: response.error } : {}),
        stderr: response.stderr,
        stdout: response.stdout,
      })
    }
    worker.onerror = () => {
      if (settled) return
      settled = true
      finish()
      reject(new Error("Browser Python could not start"))
    }
    worker.postMessage({ code })
  })

  return {
    cancel: () => {
      if (settled) return
      settled = true
      finish()
      rejectResult(new DOMException("Browser Python stopped", "AbortError"))
    },
    result,
  }
}
