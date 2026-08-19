import { describe, expect, it } from "vitest"

import { normalizeMarkdownMath } from "./markdown-math"

describe("normalizeMarkdownMath", () => {
  it("normalizes paired inline and display LaTeX delimiters", () => {
    expect(normalizeMarkdownMath("Inline \\(x + 1\\).\n\n\\[x^2\\]")).toBe(
      "Inline $x + 1$.\n\n$$\nx^2\n$$"
    )
  })

  it("preserves delimiters in inline and fenced code", () => {
    const markdown = [
      "Use `\\(inline example\\)`.",
      "",
      "```markdown",
      "\\[display example\\]",
      "```",
      "",
      "Render \\(x\\).",
    ].join("\n")

    expect(normalizeMarkdownMath(markdown)).toBe(
      markdown.replace("Render \\(x\\).", "Render $x$.")
    )
  })

  it("leaves escaped and incomplete delimiter pairs unchanged", () => {
    expect(normalizeMarkdownMath("\\\\(literal\\\\) and \\(incomplete")).toBe(
      "\\\\(literal\\\\) and \\(incomplete"
    )
  })
})
