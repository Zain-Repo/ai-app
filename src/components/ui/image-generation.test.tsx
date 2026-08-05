// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ImageGeneration } from "./image-generation"

vi.mock("motion/react", async (importOriginal) => {
  const motion = await importOriginal<Record<string, unknown>>()
  return { ...motion, useInView: () => true }
})

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

    expect(screen.getByRole("status").textContent).toBe(
      "Preparing image. Setting up the canvas and creative direction."
    )
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "0"
    )

    act(() => vi.advanceTimersByTime(3_000))
    expect(screen.getByRole("status").textContent).toBe(
      "Creating image. Sketching the first shapes."
    )

    act(() => vi.advanceTimersByTime(6_000))
    expect(screen.getByRole("status").textContent).toBe(
      "Creating image. Building the composition."
    )

    rerender(
      <ImageGeneration completed>
        <div>Image preview</div>
      </ImageGeneration>
    )
    expect(screen.getByRole("status").textContent).toBe(
      "Image ready. Your finished image is ready to view."
    )
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "100"
    )
    expect(screen.getByText("Image preview")).toBeTruthy()
  })
})
