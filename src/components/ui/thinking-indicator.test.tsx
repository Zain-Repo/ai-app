// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ThinkingIndicator } from "./thinking-indicator"

beforeEach(() => {
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
})

describe("ThinkingIndicator", () => {
  it("uses TextShimmer for the visible active word", () => {
    const { container } = render(<ThinkingIndicator words={["Thinking"]} />)
    const shimmer = Array.from(container.querySelectorAll("span")).find(
      (element) => element.style.getPropertyValue("--base-color") !== ""
    )

    expect(shimmer).toBeDefined()
    expect(shimmer?.textContent).toBe("Thinking")
    expect(shimmer instanceof HTMLElement).toBe(true)
    expect(shimmer?.style.getPropertyValue("--base-color")).toBe(
      "var(--muted-foreground)"
    )
    expect(shimmer?.style.getPropertyValue("--base-gradient-color")).toBe(
      "var(--foreground)"
    )
  })
})
