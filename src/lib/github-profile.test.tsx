import { describe, expect, it, vi } from "vitest"

import { fetchGitHubProfile } from "./github-profile"
import type { GitHubProfileError } from "./github-profile"

const profile = {
  login: "octocat",
  name: "The Octocat",
  avatar_url: "https://avatars.githubusercontent.com/u/583231",
  html_url: "https://github.com/octocat",
  bio: null,
  company: "GitHub",
  location: "San Francisco",
  public_repos: 8,
  followers: 42,
  updated_at: "2026-08-01T00:00:00Z",
}

describe("fetchGitHubProfile", () => {
  it("loads a projected public GitHub profile without a token", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(profile), { status: 200 }))

    await expect(fetchGitHubProfile("583231", fetcher)).resolves.toMatchObject({
      login: "octocat",
      avatarUrl: profile.avatar_url,
      profileUrl: profile.html_url,
      publicRepos: 8,
    })
    expect(fetcher).toHaveBeenCalledWith("https://api.github.com/user/583231", {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    })
  })

  it("rejects non-numeric provider IDs before fetching", async () => {
    const fetcher = vi.fn()

    await expect(
      fetchGitHubProfile("github-user-123", fetcher)
    ).rejects.toMatchObject({
      code: "invalid-provider-user-id",
    } satisfies Partial<GitHubProfileError>)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([
    [403, "rate-limited"],
    [404, "not-found"],
    [500, "http"],
  ] as const)("classifies HTTP %i errors", async (status, code) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }))

    await expect(fetchGitHubProfile("583231", fetcher)).rejects.toMatchObject({
      code,
    })
  })

  it("classifies fetch failures and malformed profiles", async () => {
    await expect(
      fetchGitHubProfile(
        "583231",
        vi.fn().mockRejectedValue(new Error("offline"))
      )
    ).rejects.toMatchObject({ code: "network" })
    await expect(
      fetchGitHubProfile(
        "583231",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({ login: "octocat" })))
      )
    ).rejects.toMatchObject({ code: "invalid-response" })
  })

  it.each([
    ["avatar_url", "https://evil.example/avatar.png"],
    ["avatar_url", "http://avatars.githubusercontent.com/avatar.png"],
    ["html_url", "https://evil.example/octocat"],
    ["html_url", "https://github.com.evil.example/octocat"],
  ] as const)("rejects unexpected %s URLs", async (field, url) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ ...profile, [field]: url }))
      )

    await expect(fetchGitHubProfile("583231", fetcher)).rejects.toMatchObject({
      code: "invalid-response",
    })
  })
})
