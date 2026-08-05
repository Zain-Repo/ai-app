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
