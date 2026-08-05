// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ImageGeneration } from "./image-generation"

vi.mock("motion/react", async (importOriginal) => {
  const motion = await importOriginal<Record<string, unknown>>()
  return { ...motion, useReducedMotion: () => false }
})

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ImageGeneration", () => {
  it("reports elapsed time without presenting an estimated percentage", () => {
    render(
      <ImageGeneration>
        <div>Image preview</div>
      </ImageGeneration>
    )

    expect(screen.getByRole("status").textContent).toBe("Creating image")
    expect(screen.getByText(/0s elapsed/)).toBeTruthy()
    expect(
      screen.getByRole("progressbar").getAttribute("aria-valuenow")
    ).toBeNull()

    act(() => vi.advanceTimersByTime(6_000))
    expect(screen.getByText(/6s elapsed/)).toBeTruthy()
    expect(screen.getByText("Image preview")).toBeTruthy()
  })

  it("reports completion from the backend state", () => {
    render(
      <ImageGeneration completed>
        <div>Image preview</div>
      </ImageGeneration>
    )

    expect(screen.getByRole("status").textContent).toBe("Image ready")
    expect(
      screen.getByText("Your finished image is ready to view.")
    ).toBeTruthy()
    expect(screen.queryByRole("progressbar")).toBeNull()
  })
})
