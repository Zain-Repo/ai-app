"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface Suggestion {
  description?: string
  label: string
  prompt: string
}

interface AiSuggestedActionsProps {
  className?: string
  disabled?: boolean
  onSelect?: (prompt: string) => void
  suggestions: readonly Suggestion[]
}

function AiSuggestedActions({
  className,
  disabled = false,
  onSelect,
  suggestions,
}: AiSuggestedActionsProps) {
  return (
    <div
      aria-label="Suggested prompts"
      className={cn("grid w-full gap-2 sm:grid-cols-2", className)}
      data-slot="ai-suggested-actions"
      role="group"
    >
      {suggestions.map((suggestion) => (
        <Button
          className="group/suggestion h-auto min-h-16 items-start justify-start overflow-hidden rounded-xl px-4 py-3 text-left whitespace-normal transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 hover:border-foreground/15 hover:bg-card hover:shadow-[0_12px_30px_-24px_color-mix(in_oklch,var(--foreground)_42%,transparent)] active:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
          data-chat-suggestion=""
          disabled={disabled || !onSelect}
          key={suggestion.prompt}
          onClick={() => onSelect?.(suggestion.prompt)}
          type="button"
          variant="outline"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {suggestion.label}
            </span>
            {suggestion.description ? (
              <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                {suggestion.description}
              </span>
            ) : null}
          </span>
        </Button>
      ))}
    </div>
  )
}

export { AiSuggestedActions }
export type { AiSuggestedActionsProps, Suggestion }
