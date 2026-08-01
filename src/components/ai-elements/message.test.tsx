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

  it("renders accessible inline and display LaTeX with common math symbols", async () => {
    const { container } = render(
      <MessageResponse>
        {
          "Inline: $\\alpha + \\beta = \\frac{1}{2}$.\n\n$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$"
        }
      </MessageResponse>
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".katex")).toHaveLength(2)
    })
    expect(container.querySelectorAll("math")).toHaveLength(2)
    expect(container.querySelectorAll("math annotation")[0].textContent).toBe(
      "\\alpha + \\beta = \\frac{1}{2}"
    )
    expect(container.querySelectorAll("math annotation")[1].textContent).toBe(
      "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}"
    )
  })

  it("does not treat an unclosed currency amount as math", () => {
    const { container } = render(
      <MessageResponse>
        {"The subscription costs $5 per month."}
      </MessageResponse>
    )

    expect(container.querySelector(".katex")).toBeNull()
    expect(container.textContent).toContain("$5 per month.")
  })
})
