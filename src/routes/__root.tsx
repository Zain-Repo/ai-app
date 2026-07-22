import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start"
import { shadcn } from "@clerk/ui/themes"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"

import appCss from "../styles.css?url"

const convexUrl = import.meta.env.VITE_CONVEX_URL

if (!convexUrl) {
  throw new Error("Missing VITE_CONVEX_URL in .env.local")
}

const convex = new ConvexReactClient(convexUrl)

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "AI Harness | One workspace for every model",
      },
      {
        name: "description",
        content:
          "Connect your AI providers, route work to the right model, and keep every run in one focused workspace.",
      },
      {
        name: "theme-color",
        content: "#070807",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
      {
        rel: "icon",
        href: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        rel: "icon",
        href: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
        sizes: "180x180",
      },
      {
        rel: "manifest",
        href: "/site.webmanifest",
      },
    ],
  }),
  notFoundComponent: () => (
    <main className="app-view grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <div className="app-callback-surface w-full max-w-md border-y border-border py-9 text-center">
        <p className="font-heading text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          Error 404
        </p>
        <h1 className="mt-3 font-heading text-3xl font-semibold tracking-tight">
          This page wandered off.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The address may be outdated, or the page may have moved somewhere new.
        </p>
        <a
          className="mt-6 inline-flex h-9 items-center justify-center rounded-2xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-all duration-200 ease-out hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none active:translate-y-px"
          href="/"
        >
          Return home
        </a>
      </div>
    </main>
  ),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider
          appearance={{ theme: shadcn }}
          signInFallbackRedirectUrl="/chat"
          signUpFallbackRedirectUrl="/chat"
        >
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            {children}
            <TanStackDevtools
              config={{
                position: "bottom-right",
              }}
              plugins={[
                {
                  name: "Tanstack Router",
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
            <Scripts />
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </body>
    </html>
  )
}
