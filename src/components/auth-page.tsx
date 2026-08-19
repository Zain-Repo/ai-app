import { SignIn, SignUp } from "@clerk/tanstack-react-start"

import { Dev3Mark } from "@/components/dev3-logo"

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
          aria-label={desktop ? "Dev3 desktop access" : "Dev3 home"}
          className="mb-7 flex items-center gap-2.5 rounded-[5px] font-heading text-sm font-semibold tracking-tight transition-opacity outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring"
          href={desktop ? "/desktop" : "/"}
        >
          <span className="grid size-9 place-items-center rounded-[5px] bg-[#0B0D12] p-1 ring-1 ring-border">
            <Dev3Mark className="size-full" mode="dark" />
          </span>
          <span>
            Dev3
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
