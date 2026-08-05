// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AiResponseActions } from "./ai-response-actions"

const writeText = vi.fn()

beforeEach(() => {
  writeText.mockReset()
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  })
})

afterEach(cleanup)

describe("AiResponseActions", () => {
  it("copies response content and confirms success accessibly", async () => {
    writeText.mockResolvedValue(undefined)
    const view = render(<AiResponseActions content="A useful response" />)

    fireEvent.click(view.getByRole("button", { name: "Copy response" }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("A useful response")
      expect(view.getByRole("button", { name: "Response copied" })).toBeTruthy()
    })
  })

  it("reports clipboard failures without rejecting the interaction", async () => {
    const error = new Error("Permission denied")
    const onCopyError = vi.fn()
    writeText.mockRejectedValue(error)
    const view = render(
      <AiResponseActions content="A response" onCopyError={onCopyError} />
    )

    fireEvent.click(view.getByRole("button", { name: "Copy response" }))

    await waitFor(() => {
      expect(onCopyError).toHaveBeenCalledWith(error)
      expect(view.getByRole("button", { name: "Copy failed" })).toBeTruthy()
    })
  })
})
