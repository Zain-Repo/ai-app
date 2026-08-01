// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarUserMenu, getUserInitials } from "./sidebar-user-menu"

const clerk = vi.hoisted(() => ({
  openUserProfile: vi.fn(),
  signOut: vi.fn(),
}))

const theme = vi.hoisted(() => ({
  resolvedTheme: "light",
  setTheme: vi.fn(),
}))

vi.mock("@clerk/tanstack-react-start", () => ({
  useClerk: () => clerk,
  useUser: () => ({
    user: {
      fullName: "Ada Lovelace",
      imageUrl: "",
      primaryEmailAddress: { emailAddress: "ada@example.com" },
      username: "ada",
    },
  }),
}))

vi.mock("next-themes", () => ({
  useTheme: () => theme,
}))

beforeEach(() => {
  clerk.openUserProfile.mockReset()
  clerk.signOut.mockReset()
  theme.resolvedTheme = "light"
  theme.setTheme.mockReset()
})

afterEach(cleanup)

describe("sidebar user menu", () => {
  it("creates readable initials from names and email fallbacks", () => {
    expect(getUserInitials("Ada Lovelace", "ada@example.com")).toBe("AL")
    expect(getUserInitials(undefined, "user@example.com")).toBe("US")
  })

  it("switches from the resolved light theme to dark mode", async () => {
    render(
      <SidebarUserMenu
        desktopAvailable={false}
        onOpenAppUpdates={vi.fn()}
        onOpenArchivedChats={vi.fn()}
        onOpenPersonalization={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Ada Lovelace",
      })
    )
    const themeItem = await screen.findByRole("menuitemcheckbox")
    expect(themeItem.textContent).toContain("Appearance")
    expect(themeItem.textContent).toContain("Light theme")

    fireEvent.click(themeItem)

    expect(theme.setTheme).toHaveBeenCalledWith("dark")
  })
})
