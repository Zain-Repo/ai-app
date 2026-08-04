import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useAction } from "convex/react"
import { useEffect, useRef, useState } from "react"

import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { takeOpenRouterPkceVerifier } from "@/lib/openrouter-oauth"

export const Route = createFileRoute("/provider-callback/openrouter")({
  validateSearch: (search: Record<string, unknown>) => ({
    code: typeof search.code === "string" ? search.code : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  component: OpenRouterCallback,
})

function OpenRouterCallback() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const completeOpenRouter = useAction(api.providerOAuth.completeOpenRouter)
  const started = useRef(false)
  const [status, setStatus] = useState<"connecting" | "failed">("connecting")

  useEffect(() => {
    if (started.current) return
    started.current = true

    const verifier = takeOpenRouterPkceVerifier(sessionStorage)

    if (search.error || !search.code || !verifier) {
      setStatus("failed")
      return
    }

    void completeOpenRouter({ code: search.code, codeVerifier: verifier }).then(
      () =>
        navigate({
          to: "/chat/{-$slug}",
          params: { slug: undefined },
          search: {
            mode: undefined,
            projectId: undefined,
          },
        }),
      () => setStatus("failed")
    )
  }, [completeOpenRouter, navigate, search.code, search.error])

  return (
    <main className="app-view grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <div className="app-callback-surface w-full max-w-sm border-y border-border py-8 text-center">
        <span className="mx-auto mb-5 grid size-11 place-items-center rounded-2xl bg-muted text-primary ring-1 ring-border">
          {status === "connecting" ? (
            <Spinner className="size-5" />
          ) : (
            <span className="font-heading text-sm font-semibold">OR</span>
          )}
        </span>
        <h1 className="text-lg font-semibold">
          {status === "connecting"
            ? "Connecting OpenRouter"
            : "OpenRouter connection failed"}
        </h1>
        <p
          className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground"
          aria-live="polite"
        >
          {status === "connecting"
            ? "Exchanging the authorization securely..."
            : "The authorization could not be completed. Start the connection again from chat."}
        </p>
        {status === "failed" ? (
          <Button
            className="mt-5"
            onClick={() =>
              void navigate({
                to: "/chat/{-$slug}",
                params: { slug: undefined },
                search: {
                  mode: undefined,
                  projectId: undefined,
                },
              })
            }
          >
            Back to chat
          </Button>
        ) : null}
      </div>
    </main>
  )
}
