import { SignIn, SignUp } from "@clerk/tanstack-react-start"

export function AuthPage({
  desktop = false,
  mode,
}: {
  desktop?: boolean
  mode: "sign-in" | "sign-up"
}) {
  const signInPath = desktop ? "/desktop/sign-in" : "/sign-in"
  const signUpPath = desktop ? "/desktop/sign-up" : "/sign-up"

  return (
    <main className="app-view app-auth-page grid min-h-[100dvh] place-items-center px-4 py-10 text-foreground">
      <div className="app-auth-surface flex w-full max-w-md flex-col items-center">
        <a
          aria-label={desktop ? "AI Harness desktop access" : "AI Harness home"}
          className="mb-7 flex items-center gap-2.5 rounded-xl font-heading text-sm font-semibold tracking-tight transition-opacity outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          href={desktop ? "/desktop" : "/"}
        >
          <img
            alt=""
            className="size-9 rounded-xl ring-1 ring-border"
            height={72}
            src="/media/ai-harness-logo.png"
            width={72}
          />
          <span>
            AI Harness
            {desktop ? (
              <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                Desktop
              </span>
            ) : null}
          </span>
        </a>

        {mode === "sign-in" ? (
          <SignIn
            fallbackRedirectUrl="/chat"
            forceRedirectUrl={desktop ? "/chat" : undefined}
            path={signInPath}
            routing="path"
            signUpFallbackRedirectUrl="/chat"
            signUpForceRedirectUrl={desktop ? "/chat" : undefined}
            signUpUrl={signUpPath}
          />
        ) : (
          <SignUp
            fallbackRedirectUrl="/chat"
            forceRedirectUrl={desktop ? "/chat" : undefined}
            path={signUpPath}
            routing="path"
            signInFallbackRedirectUrl="/chat"
            signInForceRedirectUrl={desktop ? "/chat" : undefined}
            signInUrl={signInPath}
          />
        )}

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          {desktop
            ? "Secure access to your conversations, projects, and connected providers."
            : mode === "sign-in"
              ? "One secure workspace for your providers, projects, and conversations."
              : "Start with one provider. Add the rest when your work needs them."}
        </p>
      </div>
    </main>
  )
}
