// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarModeControls } from "./sidebar-mode-controls"
import { SidebarProvider } from "./ui/sidebar"

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

afterEach(cleanup)

describe("sidebar mode controls", () => {
  it("shows descriptive output modes and selects image mode", async () => {
    const onModeChange = vi.fn()

    render(
      <SidebarProvider>
        <SidebarModeControls
          disabled={false}
          hasImageProvider
          mode="text"
          onModeChange={onModeChange}
          onVoiceActivate={vi.fn()}
        />
      </SidebarProvider>
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose output mode. Current mode: Text",
      })
    )

    expect(await screen.findByText("Create, learn, and explore")).toBeTruthy()
    expect(screen.getByRole("menu").className).toContain("w-64")
    const imageOption = screen.getByRole("menuitemradio", { name: /Image/ })
    expect(imageOption.textContent).toContain("Generate and refine images")
    expect(imageOption.className).toContain("min-h-11")

    fireEvent.click(imageOption)

    expect(onModeChange).toHaveBeenCalledWith("image")
  })

  it("hides unavailable image mode and keeps voice activation accessible", async () => {
    const onModeChange = vi.fn()
    const onVoiceActivate = vi.fn()

    render(
      <SidebarProvider>
        <SidebarModeControls
          disabled={false}
          hasImageProvider={false}
          mode="text"
          onModeChange={onModeChange}
          onVoiceActivate={onVoiceActivate}
        />
      </SidebarProvider>
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose output mode. Current mode: Text",
      })
    )

    expect(
      await screen.findByRole("menuitemradio", { name: /Text/ })
    ).toBeTruthy()
    expect(screen.queryByRole("menuitemradio", { name: /Image/ })).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }))

    expect(onVoiceActivate).toHaveBeenCalledOnce()
    expect(onModeChange).not.toHaveBeenCalled()
  })
})
