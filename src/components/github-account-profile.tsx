import { createRoot } from "react-dom/client"
import { useEffect, useState } from "react"

import { fetchGitHubProfile } from "@/lib/github-profile"
import type { GitHubProfile } from "@/lib/github-profile"
import type { Root } from "react-dom/client"

type ProfileState =
  | { status: "loading" }
  | { status: "ready"; profile: GitHubProfile }
  | { status: "error"; message: string }

export type GitHubProfileCustomPage = {
  label: string
  url: string
  mount: (el: HTMLDivElement) => void
  unmount: (el?: HTMLDivElement) => void
  mountIcon: (el: HTMLDivElement) => void
  unmountIcon: (el?: HTMLDivElement) => void
}

function GitHubAccountProfile({ providerUserId }: { providerUserId: string }) {
  const [reloadKey, setReloadKey] = useState(0)
  const [state, setState] = useState<ProfileState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })

    void fetchGitHubProfile(providerUserId).then(
      (profile) => {
        if (!cancelled) {
          setState({ status: "ready", profile })
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          const message =
            error instanceof Error
              ? error.message
              : "GitHub could not load this profile."
          setState({ status: "error", message })
        }
      }
    )

    return () => {
      cancelled = true
    }
  }, [providerUserId, reloadKey])

  if (state.status === "loading") {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Loading GitHub profile...
      </p>
    )
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3 p-4" role="alert">
        <p className="text-sm text-destructive">{state.message}</p>
        <button
          className="text-sm font-medium text-primary underline"
          onClick={() => setReloadKey((key) => key + 1)}
          type="button"
        >
          Try again
        </button>
      </div>
    )
  }

  const { profile } = state
  return (
    <section className="space-y-4 p-4" aria-label="GitHub profile">
      <div className="flex items-center gap-3">
        <img alt="" className="size-12 rounded-full" src={profile.avatarUrl} />
        <div className="min-w-0">
          <p className="truncate font-medium">
            {profile.name ?? profile.login}
          </p>
          <p className="text-sm text-muted-foreground">@{profile.login}</p>
        </div>
      </div>
      {profile.bio ? (
        <p className="text-sm text-muted-foreground">{profile.bio}</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Repositories</dt>
          <dd>{profile.publicRepos}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Followers</dt>
          <dd>{profile.followers}</dd>
        </div>
        {profile.company ? (
          <div>
            <dt className="text-muted-foreground">Company</dt>
            <dd>{profile.company}</dd>
          </div>
        ) : null}
        {profile.location ? (
          <div>
            <dt className="text-muted-foreground">Location</dt>
            <dd>{profile.location}</dd>
          </div>
        ) : null}
      </dl>
      <a
        className="text-sm font-medium text-primary underline"
        href={profile.profileUrl}
        rel="noreferrer"
        target="_blank"
      >
        Open on GitHub
      </a>
    </section>
  )
}

export function createGitHubProfileCustomPage(
  providerUserId: string
): GitHubProfileCustomPage {
  let pageRoot: Root | undefined
  let iconRoot: Root | undefined

  return {
    label: "GitHub profile",
    url: "github-profile",
    mount: (el) => {
      pageRoot?.unmount()
      pageRoot = createRoot(el)
      pageRoot.render(<GitHubAccountProfile providerUserId={providerUserId} />)
    },
    unmount: () => {
      pageRoot?.unmount()
      pageRoot = undefined
    },
    mountIcon: (el) => {
      iconRoot?.unmount()
      iconRoot = createRoot(el)
      iconRoot.render(<span aria-hidden="true">GH</span>)
    },
    unmountIcon: () => {
      iconRoot?.unmount()
      iconRoot = undefined
    },
  }
}

export { GitHubAccountProfile }
