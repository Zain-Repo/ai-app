// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Context, ContextTrigger } from "./context"

describe("Context", () => {
  it("renders the session usage percentage as an accessible button", () => {
    render(
      <Context maxTokens={100_000} usedTokens={12_500}>
        <ContextTrigger aria-label="View session context usage" />
      </Context>
    )

    expect(
      screen.getByRole("button", { name: "View session context usage" })
        .textContent
    ).toContain("12.5%")
  })
})
