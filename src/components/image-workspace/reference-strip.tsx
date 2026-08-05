import { ChevronLeft, ChevronRight, ImagePlus, X } from "lucide-react"
import { useEffect, useMemo } from "react"

import { Button } from "@/components/ui/button"

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
}: {
  reference: ImageReference
  index: number
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  total: number
}) {
  const url = useMemo(
    () => URL.createObjectURL(reference.file),
    [reference.file]
  )
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <li className="group relative size-16 shrink-0 overflow-hidden rounded-xl border bg-muted">
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
  disabled,
  limit,
  onChange,
  references,
}: {
  disabled?: boolean
  limit: number
  onChange: (references: ImageReference[]) => void
  references: ImageReference[]
}) {
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
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <label
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          htmlFor="image-reference-upload"
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
            htmlFor="image-reference-upload"
          >
            <ImagePlus aria-hidden="true" className="size-5" />
            <span className="sr-only">Add reference images</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={disabled}
              id="image-reference-upload"
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
