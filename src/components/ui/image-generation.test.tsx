// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ImageGeneration } from "./image-generation"

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      media: query,
      removeEventListener: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe("ImageGeneration", () => {
  it("tracks startup and real completion while keeping the preview mounted", () => {
    const { rerender } = render(
      <ImageGeneration>
        <div>Image preview</div>
      </ImageGeneration>
    )

    expect(screen.getByRole("status").textContent).toBe("Getting started.")
    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.getByRole("status").textContent).toBe(
      "Creating image. May take a moment."
    )

    rerender(
      <ImageGeneration completed>
        <div>Image preview</div>
      </ImageGeneration>
    )
    expect(screen.getByRole("status").textContent).toBe("Image created.")
    expect(screen.getByText("Image preview")).toBeTruthy()
  })
})
