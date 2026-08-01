import { useClerk, useUser } from "@clerk/tanstack-react-start"
import {
  AccountSetting02Icon,
  AiBrain01Icon,
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
  onOpenMemory: () => void
  onOpenPreferences: () => void
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
  onOpenMemory,
  onOpenPreferences,
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

  async function handleSignOut() {
    try {
      await signOut({ redirectUrl: "/" })
    } catch {
      toast.error("Could not sign out. Please try again.")
    }
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
        <DropdownMenuItem onClick={() => openUserProfile()}>
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
        <DropdownMenuItem onClick={onOpenMemory}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={AiBrain01Icon}
            strokeWidth={1.8}
          />
          Memory
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenPreferences}>
          <HugeiconsIcon
            aria-hidden="true"
            icon={Settings02Icon}
            strokeWidth={1.8}
          />
          Preferences
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
