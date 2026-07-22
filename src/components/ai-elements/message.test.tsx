// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MessageResponse } from "./message"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MessageResponse", () => {
  it("renders fenced code without the optional syntax-highlighter chunk", async () => {
    const { container } = render(
      <MessageResponse>{"```html\n<main>Hello</main>\n```"}</MessageResponse>
    )

    const code = await waitFor(() => {
      const element = container.querySelector("pre code")
      expect(element).toBeTruthy()
      return element
    })
    expect(code?.textContent).toBe("<main>Hello</main>")
    expect(code?.closest("pre")?.className).toContain("overflow-x-auto")
    expect(
      container.querySelector('button[aria-label="Run Python"]')
    ).toBeNull()
  })

  it("offers the browser runtime for Python code", async () => {
    class BrowserPythonWorker {
      onerror: (() => void) | null = null
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null

      postMessage() {
        queueMicrotask(() =>
          this.onmessage?.(
            new MessageEvent("message", {
              data: { stderr: "", stdout: "4\n", type: "result" },
            })
          )
        )
      }

      terminate() {}
    }
    vi.stubGlobal("Worker", BrowserPythonWorker)
    const { container } = render(
      <MessageResponse>{"```python\nprint(2 + 2)\n```"}</MessageResponse>
    )

    let runButton: HTMLButtonElement | null = null
    await waitFor(() => {
      runButton = container.querySelector('button[aria-label="Run Python"]')
      expect(runButton).toBeTruthy()
    })
    fireEvent.click(runButton!)
    await waitFor(() => {
      expect(container.textContent).toContain("Browser Python")
      expect(container.textContent).toContain("4")
    })
  })

  it("renders accessible inline and display math", async () => {
    const { container } = render(
      <MessageResponse>
        {"Inline: $$x^2$$\n\n$$\ne^{i\\pi} + 1 = 0\n$$"}
      </MessageResponse>
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".katex")).toHaveLength(2)
    })
    expect(container.querySelectorAll("math")).toHaveLength(2)
  })
})
