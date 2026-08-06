import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react"
import { useEffect, useId, useMemo } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ImageReference = {
  file: File
  id: string
}

function ReferencePreview({
  reference,
  index,
  onMove,
  onRemove,
  total,
  compact = false,
}: {
  reference: ImageReference
  index: number
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  total: number
  compact?: boolean
}) {
  const url = useMemo(
    () => URL.createObjectURL(reference.file),
    [reference.file]
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <li
      className={cn(
        "group relative shrink-0 overflow-hidden border bg-muted",
        compact ? "size-12 rounded-md" : "size-16 rounded-xl"
      )}
    >
      <img
        alt={`Reference ${index + 1}: ${reference.file.name}`}
        className="size-full object-cover"
        src={url}
      />
      <Button
        aria-label={`Remove ${reference.file.name}`}
        className="absolute top-1 right-1 size-6 bg-background/90 opacity-100 shadow-sm sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
        onClick={() => onRemove(reference.id)}
        size="icon-xs"
        type="button"
        variant="outline"
      >
        <X aria-hidden="true" />
      </Button>
      <span className="absolute bottom-1 left-1 flex overflow-hidden rounded-md bg-background/90 shadow-sm">
        <button
          aria-label={`Move ${reference.file.name} earlier`}
          className="grid size-6 place-items-center disabled:opacity-35"
          disabled={index === 0}
          onClick={() => onMove(index, index - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="size-3.5" />
        </button>
        <button
          aria-label={`Move ${reference.file.name} later`}
          className="grid size-6 place-items-center disabled:opacity-35"
          disabled={index === total - 1}
          onClick={() => onMove(index, index + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" className="size-3.5" />
        </button>
      </span>
    </li>
  )
}

export function ReferenceStrip({
  compact = false,
  disabled,
  limit,
  onChange,
  references,
}: {
  compact?: boolean
  disabled?: boolean
  limit: number
  onChange: (references: ImageReference[]) => void
  references: ImageReference[]
}) {
  const inputId = useId()
  const addFiles = (files: FileList | null) => {
    if (!files) return
    const available = Math.max(0, limit - references.length)
    const additions = [...files]
      .filter((file) =>
        ["image/jpeg", "image/png", "image/webp"].includes(file.type)
      )
      .slice(0, available)
      .map((file) => ({ file, id: crypto.randomUUID() }))
    onChange([...references, ...additions])
  }
  const move = (from: number, to: number) => {
    const next = [...references]
    const moved = next.at(from)
    if (!moved) return
    next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange(next)
  }

  if (limit === 0) return null

  if (compact)
    return (
      <div className="flex min-w-0 items-center gap-2">
        <label
          className={cn(
            "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border bg-background px-3 text-sm font-medium transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring hover:bg-muted/60",
            (disabled || references.length >= limit) &&
              "pointer-events-none opacity-50"
          )}
          htmlFor={inputId}
        >
          <ImagePlus aria-hidden="true" className="size-4" />
          <span>References</span>
          <span className="text-muted-foreground">
            {references.length}/{limit}
          </span>
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Add reference images"
            className="sr-only"
            disabled={disabled || references.length >= limit}
            id={inputId}
            multiple
            onChange={(event) => {
              addFiles(event.target.files)
              event.currentTarget.value = ""
            }}
            type="file"
          />
        </label>
        {references.length ? (
          <ul
            aria-label="Selected reference images"
            className="flex min-w-0 gap-2 overflow-x-auto py-1"
          >
            {references.map((reference, index) => (
              <ReferencePreview
                compact
                index={index}
                key={reference.id}
                onMove={move}
                onRemove={(id) =>
                  onChange(
                    references.filter((candidate) => candidate.id !== id)
                  )
                }
                reference={reference}
                total={references.length}
              />
            ))}
          </ul>
        ) : null}
      </div>
    )

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          htmlFor={inputId}
        >
          References
        </label>
        <span className="text-xs text-muted-foreground">
          {references.length}/{limit}
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <ul className="flex gap-2">
          {references.map((reference, index) => (
            <ReferencePreview
              index={index}
              key={reference.id}
              onMove={move}
              onRemove={(id) =>
                onChange(references.filter((candidate) => candidate.id !== id))
              }
              reference={reference}
              total={references.length}
            />
          ))}
        </ul>
        {references.length < limit ? (
          <label
            className="grid size-16 shrink-0 cursor-pointer place-items-center rounded-xl border border-dashed text-muted-foreground transition-colors focus-within:outline-2 focus-within:outline-ring hover:border-foreground/30 hover:bg-muted/60 hover:text-foreground"
            htmlFor={inputId}
          >
            <ImagePlus aria-hidden="true" className="size-5" />
            <span className="sr-only">Add reference images</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={disabled}
              id={inputId}
              multiple
              onChange={(event) => {
                addFiles(event.target.files)
                event.currentTarget.value = ""
              }}
              type="file"
            />
          </label>
        ) : null}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The first image has the strongest influence. Use the arrow controls to
        set reference order.
      </p>
    </div>
  )
}
