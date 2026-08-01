// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  createGitHubProfileCustomPage,
  GitHubAccountProfile,
} from "./github-account-profile"

const githubProfile = vi.hoisted(() => ({ fetchGitHubProfile: vi.fn() }))

vi.mock("@/lib/github-profile", () => ({
  fetchGitHubProfile: githubProfile.fetchGitHubProfile,
}))

afterEach(() => {
  cleanup()
  githubProfile.fetchGitHubProfile.mockReset()
})

describe("GitHubAccountProfile", () => {
  it("shows the public profile and external GitHub link", async () => {
    githubProfile.fetchGitHubProfile.mockResolvedValue({
      login: "octocat",
      name: "The Octocat",
      avatarUrl: "https://example.com/avatar.png",
      profileUrl: "https://github.com/octocat",
      bio: "Hello",
      company: null,
      location: null,
      publicRepos: 8,
      followers: 42,
      updatedAt: "2026-08-01T00:00:00Z",
    })
    render(<GitHubAccountProfile providerUserId="583231" />)

    expect(await screen.findByText("The Octocat")).toBeTruthy()
    expect(
      screen.getByRole("link", { name: "Open on GitHub" }).getAttribute("href")
    ).toBe("https://github.com/octocat")
  })

  it("offers a retry after a friendly profile error", async () => {
    githubProfile.fetchGitHubProfile.mockRejectedValueOnce(
      new Error("GitHub is unavailable.")
    )
    githubProfile.fetchGitHubProfile.mockResolvedValueOnce({
      login: "octocat",
      name: null,
      avatarUrl: "https://example.com/avatar.png",
      profileUrl: "https://github.com/octocat",
      bio: null,
      company: null,
      location: null,
      publicRepos: 8,
      followers: 42,
      updatedAt: "2026-08-01T00:00:00Z",
    })
    render(<GitHubAccountProfile providerUserId="583231" />)

    expect((await screen.findByRole("alert")).textContent).toContain(
      "GitHub is unavailable."
    )
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(await screen.findByText("@octocat")).toBeTruthy()
  })

  it("mounts and safely unmounts the Clerk custom page and icon", async () => {
    githubProfile.fetchGitHubProfile.mockResolvedValue({
      login: "octocat",
      name: null,
      avatarUrl: "https://avatars.githubusercontent.com/u/583231",
      profileUrl: "https://github.com/octocat",
      bio: null,
      company: null,
      location: null,
      publicRepos: 8,
      followers: 42,
      updatedAt: "2026-08-01T00:00:00Z",
    })
    const page = createGitHubProfileCustomPage("583231")
    const pageElement = document.createElement("div")
    const iconElement = document.createElement("div")

    page.mount(pageElement)
    page.mountIcon(iconElement)
    document.body.append(pageElement, iconElement)

    expect(await screen.findByText("@octocat")).toBeTruthy()
    expect(iconElement.textContent).toBe("GH")

    page.unmount()
    page.unmountIcon()
    expect(pageElement.textContent).toBe("")
    expect(iconElement.textContent).toBe("")
    pageElement.remove()
    iconElement.remove()
  })
})
