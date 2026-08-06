# Shared Layouts

The app uses TanStack Router. The root route supplies document metadata, providers, theme handling, and the global shell. The chat route owns the product sidebar and switches its main content between chat, image, library, and project workspaces. The reusable sidebar identity controls are included below.## `src/routes/__root.tsx`

Root document and provider layout.

```tsx
import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start"
import { shadcn } from "@clerk/ui/themes"
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router"
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools"
import { TanStackDevtools } from "@tanstack/react-devtools"
import { ConvexReactClient } from "convex/react"
import { ConvexProviderWithClerk } from "convex/react-clerk"
import { ThemeProvider } from "next-themes"

import { DesktopUpdater } from "@/components/desktop-updater"
import { Toaster } from "@/components/ui/sonner"

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
        title: "Dev3 | One workspace for every model",
      },
      {
        name: "description",
        content:
          "Connect your AI providers, route work to the right model, and keep every run in one focused workspace.",
      },
      {
        name: "theme-color",
        content: "#f6f7f8",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <ClerkProvider
            appearance={{ theme: shadcn }}
            signInFallbackRedirectUrl="/chat"
            signUpFallbackRedirectUrl="/chat"
          >
            <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
              {children}
              <DesktopUpdater />
              <Toaster />
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
        </ThemeProvider>
      </body>
    </html>
  )
}

```## `src/router.tsx`

TanStack router construction.

```tsx
import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

```## `src/components/sidebar-workspace-switcher.tsx`

Workspace selector used in the global sidebar.

```tsx
import { ArrowDown01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { AudioWaveform } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/components/ui/sidebar"
import type { WorkspaceProduct } from "@/lib/workspace-product"

type SidebarWorkspaceSwitcherProps = {
  disabled: boolean
  workspace: WorkspaceProduct
  onWorkspaceChange: (workspace: WorkspaceProduct) => void
  onVoiceActivate: () => void
}

const workspaces = {
  chat: {
    description: "Ask, learn, and build",
    label: "Dev3 Chat",
  },
  image: {
    description: "Generate and refine images",
    label: "Dev3 Image",
  },
} satisfies Record<WorkspaceProduct, { description: string; label: string }>

const workspaceProducts = [
  "chat",
  "image",
] as const satisfies readonly WorkspaceProduct[]

function isWorkspaceProduct(value: string): value is WorkspaceProduct {
  return value === "chat" || value === "image"
}

export function SidebarWorkspaceSwitcher({
  disabled,
  workspace,
  onWorkspaceChange,
  onVoiceActivate,
}: SidebarWorkspaceSwitcherProps) {
  const { setOpenMobile } = useSidebar()
  const activeWorkspace = workspaces[workspace]

  return (
    <div
      aria-label="Workspace controls"
      className="flex min-w-0 items-center justify-between gap-1.5"
      role="group"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Choose workspace. Current workspace: ${activeWorkspace.label}`}
          className="group flex h-8 min-w-0 items-center gap-1 rounded-lg px-2 text-left text-sm font-medium tracking-tight text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-popup-open:bg-sidebar-accent"
          disabled={disabled}
        >
          <span className="truncate">{activeWorkspace.label}</span>
          <HugeiconsIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-sidebar-foreground/55 transition-transform duration-150 group-data-popup-open:rotate-180 motion-reduce:transform-none motion-reduce:transition-none"
            icon={ArrowDown01Icon}
            strokeWidth={1.8}
          />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64 p-1" sideOffset={4}>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              if (isWorkspaceProduct(value)) onWorkspaceChange(value)
            }}
            value={workspace}
          >
            {workspaceProducts.map((value) => {
              const option = workspaces[value]

              return (
                <DropdownMenuRadioItem
                  className="min-h-11 items-start py-1.5 pr-9 pl-2.5"
                  key={value}
                  value={value}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-foreground">
                      {option.label}
                    </span>
                    <span className="text-[11px] leading-3.5 text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {workspace === "chat" && !disabled ? (
        <Button
          aria-label="Start voice mode"
          className="shrink-0 rounded-lg text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground [&_svg]:size-3.5"
          onClick={() => {
            setOpenMobile(false)
            onVoiceActivate()
          }}
          size="icon-sm"
          title="Start voice mode"
          variant="ghost"
        >
          <AudioWaveform aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}

```## `src/components/sidebar-user-menu.tsx`

Persistent account menu used in the global sidebar.

```tsx
import { useClerk, useUser } from "@clerk/tanstack-react-start"
import {
  AccountSetting02Icon,
  Archive02Icon,
  Logout01Icon,
  Moon02Icon,
  Settings02Icon,
  Sun03Icon,
  SystemUpdate02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { createGitHubProfileCustomPage } from "@/components/github-account-profile"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type SidebarUserMenuProps = {
  desktopAvailable: boolean
  email?: string | null
  name?: string | null
  onOpenAppUpdates: () => void
  onOpenArchivedChats: () => void
  onOpenSettings: () => void
}

function getUserInitials(name?: string | null, email?: string | null) {
  const nameParts = name?.trim().split(/\s+/).filter(Boolean) ?? []

  if (nameParts.length > 0) {
    return `${nameParts[0]?.[0] ?? ""}${nameParts.at(-1)?.[0] ?? ""}`.toUpperCase()
  }

  return email?.trim().slice(0, 2).toUpperCase() || "U"
}

function ThemeSwitchIndicator({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "ml-auto inline-flex h-5 w-8 shrink-0 items-center rounded-2xl border-2 transition-[background-color,border-color] duration-200",
        checked ? "border-primary bg-primary" : "border-transparent bg-input/90"
      )}
    >
      <span
        className={cn(
          "block size-4 rounded-full bg-background shadow-sm transition-transform duration-200",
          checked
            ? "translate-x-[calc(100%-4px)] bg-primary-foreground"
            : "translate-x-0 dark:bg-foreground"
        )}
      />
    </span>
  )
}

function SidebarUserMenu({
  desktopAvailable,
  email: fallbackEmail,
  name: fallbackName,
  onOpenAppUpdates,
  onOpenArchivedChats,
  onOpenSettings,
}: SidebarUserMenuProps) {
  const { openUserProfile, signOut } = useClerk()
  const { user } = useUser()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const email = user?.primaryEmailAddress?.emailAddress ?? fallbackEmail
  const name = user?.fullName ?? user?.username ?? fallbackName
  const displayName = name || "Your account"
  const displayEmail = email || "Signed in"
  const darkModeEnabled = mounted && resolvedTheme === "dark"
  const githubProviderUserId = user?.externalAccounts.find(
    (account) => account.provider === "github"
  )?.providerUserId

  async function handleSignOut() {
    try {
      await signOut({ redirectUrl: "/" })
    } catch {
      toast.error("Could not sign out. Please try again.")
    }
  }

  function handleManageAccount() {
    if (githubProviderUserId) {
      openUserProfile({
        customPages: [createGitHubProfileCustomPage(githubProviderUserId)],
      })
      return
    }

    openUserProfile()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Open account menu for ${displayName}`}
        className="group flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors duration-150 outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/30 data-popup-open:bg-sidebar-accent"
      >
        <Avatar className="size-7.5">
          {user?.imageUrl ? <AvatarImage alt="" src={user.imageUrl} /> : null}
          <AvatarFallback>{getUserInitials(name, email)}</AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-medium">
            {displayName}
          </span>
          <span className="block truncate text-[11px] text-sidebar-foreground/55">
            {displayEmail}
          </span>
        </span>
        <HugeiconsIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-sidebar-foreground/45 transition-colors duration-150 group-hover:text-sidebar-foreground/70"
          icon={UnfoldMoreIcon}
          strokeWidth={1.8}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64" side="top">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center gap-2 px-2 py-2">
            <Avatar size="sm">
              {user?.imageUrl ? (
                <AvatarImage alt="" src={user.imageUrl} />
              ) : null}
              <AvatarFallback>{getUserInitials(name, email)}</AvatarFallback>
            </Avatar>
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">
                {displayName}
              </span>
              <span className="block truncate font-normal text-muted-foreground">
                {displayEmail}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleManageAccount}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={AccountSetting02Icon}
            strokeWidth={1.8}
          />
          Manage account
        </DropdownMenuItem>
        {desktopAvailable ? (
          <DropdownMenuItem onClick={onOpenAppUpdates}>
            <HugeiconsIcon
              aria-hidden="true"
              icon={SystemUpdate02Icon}
              strokeWidth={1.8}
            />
            App updates
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onOpenArchivedChats}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={Archive02Icon}
            strokeWidth={1.8}
          />
          Archived chats
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenSettings}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={Settings02Icon}
            strokeWidth={1.8}
          />
          Settings
        </DropdownMenuItem>

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={darkModeEnabled}
          className="pr-2 [&>[data-slot=dropdown-menu-checkbox-item-indicator]]:hidden"
          closeOnClick={false}
          disabled={!mounted}
          onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={darkModeEnabled ? Moon02Icon : Sun03Icon}
            strokeWidth={1.8}
          />
          <span className="flex min-w-0 flex-col">
            <span>Appearance</span>
            <span className="text-[11px] text-muted-foreground">
              {darkModeEnabled ? "Dark theme" : "Light theme"}
            </span>
          </span>
          <ThemeSwitchIndicator checked={darkModeEnabled} />
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={Logout01Icon}
            strokeWidth={1.8}
          />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export { SidebarUserMenu, getUserInitials }

```
