// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Dev3Logo, Dev3Mark } from "./dev3-logo"

afterEach(cleanup)

describe("Dev3Logo", () => {
  it("keeps a decorative mark out of the accessibility tree by default", () => {
    const view = render(<Dev3Mark />)

    expect(
      view.container.querySelector("svg")?.getAttribute("aria-hidden")
    ).toBe("true")
  })

  it("exposes an accessible image when a title is supplied", () => {
    render(<Dev3Mark title="Dev3 routing mark" />)

    expect(screen.getByRole("img", { name: "Dev3 routing mark" })).toBeTruthy()
  })

  it("renders the full wordmark as the default variant", () => {
    render(<Dev3Logo />)

    expect(screen.getByText("Dev3")).toBeTruthy()
  })

  it("gives the mark-only variant a stable accessible name", () => {
    render(<Dev3Logo variant="mark" />)

    expect(screen.getByRole("img", { name: "Dev3" })).toBeTruthy()
  })
})
