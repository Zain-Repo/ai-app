// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarWorkspaceSwitcher } from "./sidebar-workspace-switcher"

const sidebarMocks = vi.hoisted(() => ({
  setOpenMobile: vi.fn(),
}))

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ setOpenMobile: sidebarMocks.setOpenMobile }),
}))

beforeEach(() => {
  sidebarMocks.setOpenMobile.mockClear()

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

describe("sidebar workspace switcher", () => {
  it("shows both workspace options and selects Dev3 Image", async () => {
    const onWorkspaceChange = vi.fn()

    render(
      <SidebarWorkspaceSwitcher
        disabled={false}
        onVoiceActivate={vi.fn()}
        onWorkspaceChange={onWorkspaceChange}
        workspace="chat"
      />
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Choose workspace. Current workspace: Dev3 Chat",
      })
    )

    const chatOption = await screen.findByRole("menuitemradio", {
      name: /Dev3 Chat/,
    })
    const imageOption = screen.getByRole("menuitemradio", {
      name: /Dev3 Image/,
    })

    expect(chatOption.textContent).toContain("Ask, learn, and build")
    expect(imageOption.textContent).toContain("Generate and refine images")
    expect(chatOption.getAttribute("aria-checked")).toBe("true")
    expect(chatOption.querySelector("svg")).toBeTruthy()
    expect(imageOption.querySelector("svg")).toBeNull()

    fireEvent.click(imageOption)

    expect(onWorkspaceChange).toHaveBeenCalledOnce()
    expect(onWorkspaceChange).toHaveBeenCalledWith("image")
  })

  it("shows the voice action only in Dev3 Chat and closes mobile first", () => {
    const onVoiceActivate = vi.fn()
    const { rerender } = render(
      <SidebarWorkspaceSwitcher
        disabled={false}
        onVoiceActivate={onVoiceActivate}
        onWorkspaceChange={vi.fn()}
        workspace="chat"
      />
    )

    fireEvent.click(screen.getByRole("button", { name: "Start voice mode" }))

    expect(sidebarMocks.setOpenMobile).toHaveBeenCalledWith(false)
    expect(onVoiceActivate).toHaveBeenCalledOnce()
    expect(sidebarMocks.setOpenMobile.mock.invocationCallOrder[0]).toBeLessThan(
      onVoiceActivate.mock.invocationCallOrder[0]
    )

    rerender(
      <SidebarWorkspaceSwitcher
        disabled={false}
        onVoiceActivate={onVoiceActivate}
        onWorkspaceChange={vi.fn()}
        workspace="image"
      />
    )

    expect(
      screen.getByRole("button", {
        name: "Choose workspace. Current workspace: Dev3 Image",
      })
    ).toBeTruthy()
    expect(
      screen.queryByRole("button", { name: "Start voice mode" })
    ).toBeNull()
  })

  it("prevents opening the workspace menu while disabled", () => {
    render(
      <SidebarWorkspaceSwitcher
        disabled
        onVoiceActivate={vi.fn()}
        onWorkspaceChange={vi.fn()}
        workspace="chat"
      />
    )

    const trigger = screen.getByRole("button", {
      name: "Choose workspace. Current workspace: Dev3 Chat",
    })

    expect(trigger.hasAttribute("disabled")).toBe(true)
    expect(screen.queryByLabelText("Start voice mode")).toBeNull()
    fireEvent.click(trigger)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
