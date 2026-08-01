import { describe, expect, it } from "vitest"

import { getProjectContextProgressCompletedIds } from "./project-context-progress"

describe("project context progress", () => {
  it("derives completion from project setup drafts", () => {
    expect(
      getProjectContextProgressCompletedIds({
        instructions: "  Keep answers concise. ",
        name: "Website redesign",
        sourceCount: 2,
      })
    ).toEqual(["name", "instructions", "sources"])
  })

  it("does not treat whitespace or missing collections as complete", () => {
    expect(
      getProjectContextProgressCompletedIds({
        instructions: "   ",
        name: "",
        sourceCount: 0,
      })
    ).toEqual([])
  })

  it("does not require source material to create a project", () => {
    expect(
      getProjectContextProgressCompletedIds({
        instructions: "Plan the launch.",
        name: "Launch plan",
        sourceCount: 0,
      })
    ).toEqual(["name", "instructions"])
  })
})
