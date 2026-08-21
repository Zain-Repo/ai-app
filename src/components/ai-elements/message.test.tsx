// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MessageResponse } from "./message"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("MessageResponse", () => {
  it("renders fenced code in a labelled syntax-highlighted frame", async () => {
    const { container } = render(
      <MessageResponse>
        {'```typescript\nconst greeting = "Hello"\n```'}
      </MessageResponse>
    )

    const code = await waitFor(() => {
      const element = container.querySelector("pre code")
      expect(element).toBeTruthy()
      return element
    })
    expect(code?.textContent).toBe('const greeting = "Hello"')
    expect(container.textContent).toContain("TypeScript")
    expect(container.querySelector('[data-language="typescript"]')).toBeTruthy()
    expect(
      container.querySelector('button[aria-label="Copy code"]')
    ).toBeTruthy()
    await waitFor(
      () => {
        expect(
          container.querySelector('[data-highlighted="true"]')
        ).toBeTruthy()
      },
      { timeout: 5000 }
    )
    expect(
      container.querySelector('[data-highlighted="true"]')?.className
    ).toContain("overflow-x-auto")
    const highlightedPre = container.querySelector<HTMLPreElement>(
      '[data-highlighted="true"] pre'
    )!
    expect(highlightedPre.style.backgroundColor).not.toBe("")
    expect(highlightedPre.style.getPropertyValue("--shiki-dark-bg")).not.toBe(
      ""
    )
    expect(
      container.querySelector('button[aria-label="Run Python"]')
    ).toBeNull()
  })

  it("copies the original fenced source and exposes success feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal("navigator", { clipboard: { writeText } })
    const source = "const answer = 42"
    const { container } = render(
      <MessageResponse>{`\`\`\`ts\n${source}\n\`\`\``}</MessageResponse>
    )

    await waitFor(() => {
      expect(
        container.querySelector('button[aria-label="Copy code"]')
      ).toBeTruthy()
    })
    const copyButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Copy code"]'
    )!
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(source)
      expect(
        container.querySelector('button[aria-label="Code copied"]')
      ).toBeTruthy()
    })
    expect(container.textContent).toContain("Code copied to clipboard")
  })

  it("falls back to readable plain text for an unknown fence language", async () => {
    const { container } = render(
      <MessageResponse>{"```dev3-config\nfeature = true\n```"}</MessageResponse>
    )

    await waitFor(() => {
      expect(container.querySelector("pre code")?.textContent).toBe(
        "feature = true"
      )
    })
    expect(container.textContent).toContain("dev3-config")
    expect(container.querySelector('[data-highlighted="false"]')).toBeTruthy()
  })

  it("keeps unlabeled multiline fences readable and horizontally contained", async () => {
    const { container } = render(
      <MessageResponse>{"```\nfirst line\nsecond line\n```"}</MessageResponse>
    )

    await waitFor(() => {
      expect(container.querySelectorAll("pre code > span")).toHaveLength(2)
    })
    expect(container.querySelectorAll("pre code > span")[0].textContent).toBe(
      "first line"
    )
    expect(container.querySelectorAll("pre code > span")[1].textContent).toBe(
      "second line"
    )
    expect(container.textContent).toContain("Plain text")
    expect(
      container.querySelector('[data-highlighted="false"]')?.className
    ).toContain("overflow-x-auto")
  })

  it("defers highlighting until a streamed response settles", async () => {
    const source = '```ts\nconst status = "streaming"\n```'
    const view = render(<MessageResponse isAnimating>{source}</MessageResponse>)

    await waitFor(() => {
      expect(view.container.querySelector("pre code")).toBeTruthy()
    })
    expect(
      view.container.querySelector('[data-highlighted="false"]')
    ).toBeTruthy()

    view.rerender(
      <MessageResponse isAnimating={false}>{source}</MessageResponse>
    )
    await waitFor(
      () => {
        expect(
          view.container.querySelector('[data-highlighted="true"]')
        ).toBeTruthy()
      },
      { timeout: 5000 }
    )
  })

  it("highlights the python3 alias and keeps its browser runtime", async () => {
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
      <MessageResponse>{"```python3\nprint(2 + 2)\n```"}</MessageResponse>
    )

    let runButton: HTMLButtonElement | null = null
    await waitFor(() => {
      runButton = container.querySelector('button[aria-label="Run Python"]')
      expect(runButton).toBeTruthy()
    })
    expect(container.textContent).toContain("Python")
    await waitFor(
      () => {
        expect(
          container.querySelector('[data-highlighted="true"]')
        ).toBeTruthy()
      },
      { timeout: 5000 }
    )
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
