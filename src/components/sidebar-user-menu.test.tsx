// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SidebarUserMenu, getUserInitials } from "./sidebar-user-menu"

const clerk = vi.hoisted(() => ({
  openUserProfile: vi.fn(),
  signOut: vi.fn(),
}))

const githubProfile = vi.hoisted(() => ({
  createGitHubProfileCustomPage: vi.fn(),
  customPage: { label: "GitHub profile" },
}))

const theme = vi.hoisted(() => ({
  resolvedTheme: "light",
  setTheme: vi.fn(),
}))

const user = vi.hoisted(() => ({
  current: {
    fullName: "Ada Lovelace",
    imageUrl: "",
    primaryEmailAddress: { emailAddress: "ada@example.com" },
    username: "ada",
    externalAccounts: [] as { provider: string; providerUserId: string }[],
  },
}))

vi.mock("@clerk/tanstack-react-start", () => ({
  useClerk: () => clerk,
  useUser: () => ({
    user: user.current,
  }),
}))

vi.mock("@/components/github-account-profile", () => ({
  createGitHubProfileCustomPage: githubProfile.createGitHubProfileCustomPage,
}))

vi.mock("next-themes", () => ({
  useTheme: () => theme,
}))

beforeEach(() => {
  clerk.openUserProfile.mockReset()
  clerk.signOut.mockReset()
  githubProfile.createGitHubProfileCustomPage.mockReset()
  githubProfile.createGitHubProfileCustomPage.mockReturnValue(
    githubProfile.customPage
  )
  theme.resolvedTheme = "light"
  theme.setTheme.mockReset()
  user.current.externalAccounts = []
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
        onOpenMemory={vi.fn()}
        onOpenPreferences={vi.fn()}
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

  it("adds the GitHub profile page when the user has a linked GitHub account", async () => {
    user.current.externalAccounts = [
      { provider: "github", providerUserId: "583231" },
    ]

    render(
      <SidebarUserMenu
        desktopAvailable={false}
        onOpenAppUpdates={vi.fn()}
        onOpenArchivedChats={vi.fn()}
        onOpenMemory={vi.fn()}
        onOpenPreferences={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Ada Lovelace",
      })
    )
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Manage account" })
    )

    expect(githubProfile.createGitHubProfileCustomPage).toHaveBeenCalledWith(
      "583231"
    )
    expect(clerk.openUserProfile).toHaveBeenCalledWith({
      customPages: [githubProfile.customPage],
    })
  })

  it("opens the standard account dialog when GitHub is not linked", async () => {
    render(
      <SidebarUserMenu
        desktopAvailable={false}
        onOpenAppUpdates={vi.fn()}
        onOpenArchivedChats={vi.fn()}
        onOpenMemory={vi.fn()}
        onOpenPreferences={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole("button", {
        name: "Open account menu for Ada Lovelace",
      })
    )
    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Manage account" })
    )

    expect(githubProfile.createGitHubProfileCustomPage).not.toHaveBeenCalled()
    expect(clerk.openUserProfile).toHaveBeenCalledWith()
  })
})
