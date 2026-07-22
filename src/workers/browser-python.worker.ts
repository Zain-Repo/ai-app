const PYODIDE_MODULE_URL =
  "https://cdn.jsdelivr.net/pyodide/v314.0.2/full/pyodide.mjs"
const MAX_OUTPUT_LENGTH = 64 * 1_024

type RunRequest = { code: string }
type WorkerScope = {
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null
  postMessage: (message: {
    error?: string
    stderr: string
    stdout: string
    type: "result"
  }) => void
}
type PyodideRuntime = {
  runPythonAsync: (code: string) => Promise<unknown>
}
type PyodideModule = {
  loadPyodide: (options: {
    stderr: (line: string) => void
    stdout: (line: string) => void
  }) => Promise<PyodideRuntime>
}

const scope = self as unknown as WorkerScope

function appendOutput(output: string, line: string) {
  const next = `${output}${line}\n`
  return next.length <= MAX_OUTPUT_LENGTH
    ? next
    : `[earlier output truncated]\n${next.slice(-MAX_OUTPUT_LENGTH + 27)}`
}

scope.onmessage = async (event) => {
  let stderr = ""
  let stdout = ""
  try {
    if (
      typeof event.data.code !== "string" ||
      !event.data.code.trim() ||
      event.data.code.length > 32_000
    )
      throw new Error("Python code is unavailable")

    const pyodideModule = (await import(
      /* @vite-ignore */ PYODIDE_MODULE_URL
    )) as PyodideModule
    const pyodide = await pyodideModule.loadPyodide({
      stderr: (line) => {
        stderr = appendOutput(stderr, line)
      },
      stdout: (line) => {
        stdout = appendOutput(stdout, line)
      },
    })

    // ponytail: this is a user-triggered convenience runner, not the security
    // boundary. A dedicated cross-origin runtime is the upgrade if browser code
    // needs credentials, packages, or network access.
    for (const name of [
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "WebTransport",
      "indexedDB",
      "caches",
    ]) {
      try {
        Object.defineProperty(globalThis, name, {
          configurable: false,
          value: undefined,
          writable: false,
        })
      } catch {
        // Some browser globals are not configurable; the Python import guard
        // below still removes the normal Pyodide bridge to them.
      }
    }
    await pyodide.runPythonAsync(`
import builtins
import sys

_browser_python_import = builtins.__import__
_browser_python_blocked = {"js", "micropip", "pyodide"}

def _browser_python_safe_import(name, *args, **kwargs):
    if name.split(".", 1)[0] in _browser_python_blocked:
        raise ImportError(f"{name} is unavailable in browser Python")
    return _browser_python_import(name, *args, **kwargs)

for _name in list(sys.modules):
    if _name.split(".", 1)[0] in _browser_python_blocked:
        sys.modules.pop(_name, None)
builtins.__import__ = _browser_python_safe_import
`)
    await pyodide.runPythonAsync(event.data.code)
    scope.postMessage({ stderr, stdout, type: "result" })
  } catch (cause) {
    scope.postMessage({
      error: cause instanceof Error ? cause.message : "Python execution failed",
      stderr,
      stdout,
      type: "result",
    })
  }
}
