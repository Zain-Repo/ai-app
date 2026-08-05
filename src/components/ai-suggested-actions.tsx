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
          className="h-auto min-h-14 items-start justify-start rounded-xl px-3 py-2.5 text-left whitespace-normal"
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
