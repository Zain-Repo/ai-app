import { SignIn } from "@clerk/tanstack-react-start"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/sign-in/$")({
  component: Page,
})

function Page() {
  return (
    <main className="app-view app-auth-page grid min-h-svh place-items-center px-4 py-10 text-foreground">
      <div className="app-auth-surface flex w-full max-w-md flex-col items-center">
        <a
          aria-label="AI Harness home"
          className="mb-7 flex items-center gap-2.5 rounded-xl font-heading text-sm font-semibold tracking-tight transition-opacity outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          href="/"
        >
          <img
            alt=""
            className="size-9 rounded-xl ring-1 ring-border"
            height={72}
            src="/media/ai-harness-logo.png"
            width={72}
          />
          AI Harness
        </a>
        <SignIn />
        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          One secure workspace for your providers, projects, and conversations.
        </p>
      </div>
    </main>
  )
}
