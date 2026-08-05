// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { AiSuggestedActions } from "./ai-suggested-actions"

const suggestions = [
  {
    label: "Debug an issue",
    description: "Diagnose a bug.",
    prompt: "Help me debug this issue.",
  },
]

afterEach(cleanup)

describe("AiSuggestedActions", () => {
  it("submits the selected prompt", () => {
    const onSelect = vi.fn()
    const view = render(
      <AiSuggestedActions onSelect={onSelect} suggestions={suggestions} />
    )

    fireEvent.click(view.getByRole("button", { name: /Debug an issue/ }))

    expect(onSelect).toHaveBeenCalledWith("Help me debug this issue.")
  })

  it("disables suggestions when chat actions are unavailable", () => {
    const view = render(
      <AiSuggestedActions disabled suggestions={suggestions} />
    )

    expect(
      view
        .getByRole("button", { name: /Debug an issue/ })
        .hasAttribute("disabled")
    ).toBe(true)
  })
})
