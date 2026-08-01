export type GitHubProfile = {
  login: string
  name: string | null
  avatarUrl: string
  profileUrl: string
  bio: string | null
  company: string | null
  location: string | null
  publicRepos: number
  followers: number
  updatedAt: string
}

export type GitHubProfileErrorCode =
  | "invalid-provider-user-id"
  | "rate-limited"
  | "not-found"
  | "http"
  | "network"
  | "invalid-response"

export class GitHubProfileError extends Error {
  readonly code: GitHubProfileErrorCode

  constructor(code: GitHubProfileErrorCode, message: string) {
    super(message)
    this.name = "GitHubProfileError"
    this.code = code
  }
}

type GitHubProfileFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>

type GitHubProfileResponse = {
  login: string
  name: string | null
  avatar_url: string
  html_url: string
  bio: string | null
  company: string | null
  location: string | null
  public_repos: number
  followers: number
  updated_at: string
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
}

function isExpectedHttpsUrl(value: string, hostname: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.hostname === hostname
  } catch {
    return false
  }
}

function parseGitHubProfile(value: unknown): GitHubProfile {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new GitHubProfileError(
      "invalid-response",
      "GitHub returned an invalid profile."
    )
  }

  const profile = value as Record<string, unknown>
  if (
    typeof profile.login !== "string" ||
    typeof profile.avatar_url !== "string" ||
    typeof profile.html_url !== "string" ||
    !isExpectedHttpsUrl(profile.avatar_url, "avatars.githubusercontent.com") ||
    !isExpectedHttpsUrl(profile.html_url, "github.com") ||
    !isNullableString(profile.name) ||
    !isNullableString(profile.bio) ||
    !isNullableString(profile.company) ||
    !isNullableString(profile.location) ||
    !isNonNegativeInteger(profile.public_repos) ||
    !isNonNegativeInteger(profile.followers) ||
    typeof profile.updated_at !== "string"
  ) {
    throw new GitHubProfileError(
      "invalid-response",
      "GitHub returned an invalid profile."
    )
  }

  const response: GitHubProfileResponse = {
    login: profile.login,
    name: profile.name,
    avatar_url: profile.avatar_url,
    html_url: profile.html_url,
    bio: profile.bio,
    company: profile.company,
    location: profile.location,
    public_repos: profile.public_repos,
    followers: profile.followers,
    updated_at: profile.updated_at,
  }

  return {
    login: response.login,
    name: response.name,
    avatarUrl: response.avatar_url,
    profileUrl: response.html_url,
    bio: response.bio,
    company: response.company,
    location: response.location,
    publicRepos: response.public_repos,
    followers: response.followers,
    updatedAt: response.updated_at,
  }
}

export async function fetchGitHubProfile(
  providerUserId: string,
  fetcher: GitHubProfileFetcher = fetch
): Promise<GitHubProfile> {
  if (!/^[1-9]\d*$/.test(providerUserId)) {
    throw new GitHubProfileError(
      "invalid-provider-user-id",
      "The linked GitHub account has an invalid user ID."
    )
  }

  let response: Response
  try {
    response = await fetcher(`https://api.github.com/user/${providerUserId}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    })
  } catch {
    throw new GitHubProfileError(
      "network",
      "We could not reach GitHub. Please check your connection and try again."
    )
  }

  if (response.status === 403) {
    throw new GitHubProfileError(
      "rate-limited",
      "GitHub is temporarily limiting profile requests. Please try again shortly."
    )
  }
  if (response.status === 404) {
    throw new GitHubProfileError(
      "not-found",
      "This GitHub profile is no longer available."
    )
  }
  if (!response.ok) {
    throw new GitHubProfileError(
      "http",
      "GitHub could not load this profile. Please try again."
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GitHubProfileError(
      "invalid-response",
      "GitHub returned an invalid profile."
    )
  }

  return parseGitHubProfile(body)
}
