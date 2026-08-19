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

  it("renders backslash-delimited LaTeX from model-generated Markdown", async () => {
    const { container } = render(
      <MessageResponse>
        {
          "## Limits\n\n1. \\(\\displaystyle \\lim_{x \\to 2}(3x+4)\\)\n\n2. \\(\\displaystyle \\lim_{x \\to 3} \\frac{x^2-9}{x-3}\\)\n\n3. \\(\\displaystyle \\lim_{x \\to 0} \\frac{\\sin x}{x}\\)"
        }
      </MessageResponse>
    )

    await waitFor(() => {
      expect(container.querySelectorAll(".katex")).toHaveLength(3)
    })
    expect(container.querySelectorAll("math annotation")[0].textContent).toBe(
      "\\displaystyle \\lim_{x \\to 2}(3x+4)"
    )
    expect(container.textContent).not.toContain("\\(")
  })

  it("preserves display semantics for backslash-bracket LaTeX", async () => {
    const { container } = render(
      <MessageResponse>{"\\[\\sum_{i=1}^{n} i\\]"}</MessageResponse>
    )

    await waitFor(() => {
      expect(container.querySelector(".katex-display")).toBeTruthy()
    })
    expect(container.querySelector("math annotation")?.textContent).toBe(
      "\\sum_{i=1}^{n} i"
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
