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

export type SidebarOutputMode = "image" | "text"

type SidebarModeControlsProps = {
  disabled: boolean
  hasImageProvider: boolean
  mode: SidebarOutputMode
  onModeChange: (mode: SidebarOutputMode) => void
  onVoiceActivate: () => void
}

const outputModes = {
  text: {
    description: "Create, learn, and explore",
    label: "Text",
  },
  image: {
    description: "Generate and refine images",
    label: "Image",
  },
} satisfies Record<SidebarOutputMode, { description: string; label: string }>

function isSidebarOutputMode(value: string): value is SidebarOutputMode {
  return value === "image" || value === "text"
}

export function SidebarModeControls({
  disabled,
  hasImageProvider,
  mode,
  onModeChange,
  onVoiceActivate,
}: SidebarModeControlsProps) {
  const { setOpenMobile } = useSidebar()
  const activeMode = outputModes[mode]

  return (
    <div
      aria-label="Chat controls"
      className="flex min-w-0 items-center justify-between gap-2"
      role="group"
    >
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Choose output mode. Current mode: ${activeMode.label}`}
          className="group flex min-w-0 items-center gap-1 rounded-xl px-2.5 py-2 text-left text-base font-semibold tracking-tight text-sidebar-foreground transition-colors outline-none hover:bg-sidebar-accent focus-visible:ring-3 focus-visible:ring-sidebar-ring/30 disabled:cursor-not-allowed disabled:opacity-50 data-popup-open:bg-sidebar-accent"
          disabled={disabled}
        >
          <span className="truncate">{activeMode.label}</span>
          <HugeiconsIcon
            aria-hidden="true"
            className="size-4 shrink-0 text-sidebar-foreground/55 transition-transform duration-150 group-data-popup-open:rotate-180"
            icon={ArrowDown01Icon}
            strokeWidth={1.8}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-72 p-1.5"
          sideOffset={6}
        >
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              if (isSidebarOutputMode(value)) onModeChange(value)
            }}
            value={mode}
          >
            <DropdownMenuRadioItem
              className="min-h-14 items-start rounded-xl py-2.5 pr-10 pl-3"
              value="text"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium text-foreground">
                  {outputModes.text.label}
                </span>
                <span className="text-xs leading-4 text-muted-foreground">
                  {outputModes.text.description}
                </span>
              </span>
            </DropdownMenuRadioItem>
            {hasImageProvider ? (
              <DropdownMenuRadioItem
                className="min-h-14 items-start rounded-xl py-2.5 pr-10 pl-3"
                value="image"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-foreground">
                    {outputModes.image.label}
                  </span>
                  <span className="text-xs leading-4 text-muted-foreground">
                    {outputModes.image.description}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ) : null}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        aria-label="Start voice mode"
        className="shrink-0 rounded-xl text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
    </div>
  )
}
