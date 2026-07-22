"use client"

import { Check } from "lucide-react"
import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface Option {
  description?: string
  disabled?: boolean
  label: string
}

export interface OptionListProps {
  actions?: { onSubmit?: (selected: Option[]) => void }
  appearance?: { multiple?: boolean }
  control?: {
    selectedOptionIndex?: number
    selectedOptionIndexes?: number[]
  }
  data: { options: Option[] }
}

export function OptionList({
  actions,
  appearance,
  control,
  data,
}: OptionListProps) {
  const options = data.options
  const multiple = appearance?.multiple ?? false
  const selectedOptionIndex = control?.selectedOptionIndex
  const selectedOptionIndexes = control?.selectedOptionIndexes
  const [selected, setSelected] = useState<number | number[]>(
    multiple ? (selectedOptionIndexes ?? []) : (selectedOptionIndex ?? -1)
  )

  useEffect(() => {
    setSelected(
      multiple ? (selectedOptionIndexes ?? []) : (selectedOptionIndex ?? -1)
    )
  }, [multiple, selectedOptionIndex, selectedOptionIndexes])

  const selectedIndexes = Array.isArray(selected) ? selected : [selected]
  const hasSelection = selectedIndexes.some((index) => index >= 0)

  const toggle = (option: Option, index: number) => {
    if (option.disabled) return
    if (!multiple) {
      setSelected(index)
      return
    }
    setSelected((current) => {
      const indexes = Array.isArray(current) ? current : []
      return indexes.includes(index)
        ? indexes.filter((value) => value !== index)
        : [...indexes, index]
    })
  }

  return (
    <div className="w-full space-y-3 rounded-lg bg-card p-4">
      <div className="flex flex-wrap gap-2">
        {options.map((option, index) => {
          const isSelected = selectedIndexes.includes(index)
          return (
            <button
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm",
                isSelected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background hover:bg-muted",
                option.disabled && "cursor-not-allowed opacity-50"
              )}
              disabled={option.disabled}
              key={`${option.label}-${index}`}
              onClick={() => toggle(option, index)}
              type="button"
            >
              <span>{option.label}</span>
              {option.description ? (
                <span
                  className={cn(
                    "text-[10px] sm:text-xs",
                    isSelected ? "text-background/70" : "text-muted-foreground"
                  )}
                >
                  · {option.description}
                </span>
              ) : null}
              {isSelected && multiple ? (
                <Check className="size-3 sm:size-3.5" aria-hidden="true" />
              ) : null}
            </button>
          )
        })}
      </div>
      {actions?.onSubmit ? (
        <div className="flex justify-end">
          <Button
            disabled={!hasSelection}
            onClick={() =>
              actions.onSubmit?.(
                options.filter((_, index) => selectedIndexes.includes(index))
              )
            }
            size="sm"
            type="button"
          >
            Confirm
          </Button>
        </div>
      ) : null}
    </div>
  )
}
