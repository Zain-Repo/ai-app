import { describe, expect, it } from "vitest"

import { buildSystemPrompt } from "./systemPrompt"

describe("buildSystemPrompt", () => {
  it("applies language and response-detail preferences", () => {
    const prompt = buildSystemPrompt({
      language: "fr",
      responseDetail: "concise",
    })

    expect(prompt).toContain("Reply in French")
    expect(prompt).toContain("Be concise")
    expect(prompt).toContain("correct language tag")
    expect(prompt).toContain("return only that valid format")
  })

  it("requires relevant persistent project files to be used safely", () => {
    const prompt = buildSystemPrompt(
      { language: "en", responseDetail: "balanced" },
      undefined,
      ["brief.pdf", "requirements.txt"]
    )

    expect(prompt).toContain("## Project files")
    expect(prompt).toContain('"brief.pdf"')
    expect(prompt).toContain("Always consider the attached project files")
    expect(prompt).toContain("Never invent or imply file contents")
    expect(prompt).toContain("untrusted reference data")
  })
})
