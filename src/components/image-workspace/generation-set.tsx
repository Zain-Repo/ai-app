import {
  Copy,
  Download,
  Expand,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Square,
  X,
} from "lucide-react"
import { useState } from "react"
import type { FunctionReturnType } from "convex/server"

import type { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { downloadLibraryAsset } from "@/components/library-workspace"

export type GenerationSetView = FunctionReturnType<
  typeof api.imageGenerations.listByConversation
>[number]
export type GenerationOutput = GenerationSetView["outputs"][number]

const setStatusLabels = {
  canceled: "Canceled",
  complete: "Complete",
  failed: "Failed",
  partial: "Partially complete",
  queued: "Queued",
  running: "Generating",
} as const

function OutputCard({
  onOpen,
  output,
}: {
  onOpen: (output: GenerationOutput) => void
  output: GenerationOutput
}) {
  if (output.status === "succeeded" && output.url)
    return (
      <button
        aria-label={`Open generated image ${output.ordinal + 1}`}
        className="group relative min-h-48 overflow-hidden rounded-lg border bg-muted/30 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onClick={() => onOpen(output)}
        type="button"
      >
        <img
          alt={`Generated output ${output.ordinal + 1}`}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.015] motion-reduce:transition-none"
          loading="lazy"
          src={output.url}
        />
        <span className="absolute right-2 bottom-2 grid size-8 place-items-center rounded-md bg-background/90 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Expand aria-hidden="true" className="size-4" />
        </span>
      </button>
    )

  const active = output.status === "queued" || output.status === "running"
  return (
    <div
      aria-label={`Output ${output.ordinal + 1}: ${output.status}`}
      className="grid min-h-48 place-items-center rounded-lg border bg-muted/30 p-5 text-center"
      role="status"
    >
      <div>
        {active ? (
          <LoaderCircle
            aria-hidden="true"
            className="mx-auto size-5 animate-spin text-primary motion-reduce:animate-none"
          />
        ) : (
          <Square
            aria-hidden="true"
            className="mx-auto size-5 text-muted-foreground"
          />
        )}
        <p className="mt-2 text-xs font-medium capitalize">
          {output.status === "running" ? "Generating" : output.status}
        </p>
      </div>
    </div>
  )
}

export function GenerationSet({
  generation,
  onCancel,
  onRetry,
  onReuse,
  onUseAsReference,
  retryDisabled = false,
}: {
  generation: GenerationSetView
  onCancel: (generationSetId: GenerationSetView["_id"]) => void
  onRetry: (generationSetId: GenerationSetView["_id"]) => void
  onReuse: (generation: GenerationSetView) => void
  onUseAsReference: (output: GenerationOutput) => void
  retryDisabled?: boolean
}) {
  const [selectedOutput, setSelectedOutput] = useState<GenerationOutput | null>(
    null
  )
  const isActive =
    generation.status === "queued" || generation.status === "running"
  const canRetry =
    generation.status === "failed" || generation.status === "canceled"
  const created = new Date(generation.createdAt)

  return (
    <article className="border-t py-8 first:border-t-0">
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-relaxed font-medium text-foreground">
            {generation.prompt}
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {generation.model} · {generation.config.dimension}
            {generation.config.resolution
              ? ` · ${generation.config.resolution}`
              : ""}
            {` · ${setStatusLabels[generation.status]}`}
            {` · ${created.toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            aria-label="Copy prompt"
            onClick={() =>
              void navigator.clipboard.writeText(generation.prompt)
            }
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <Copy aria-hidden="true" />
          </Button>
          <Button
            onClick={() => onReuse(generation)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RefreshCw aria-hidden="true" />
            Reuse
          </Button>
          {isActive ? (
            <Button
              onClick={() => onCancel(generation._id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <X aria-hidden="true" />
              Cancel
            </Button>
          ) : canRetry ? (
            <Button
              disabled={retryDisabled}
              onClick={() => onRetry(generation._id)}
              size="sm"
              type="button"
              variant="outline"
            >
              <RefreshCw aria-hidden="true" />
              Retry
            </Button>
          ) : null}
        </div>
      </header>

      <div
        className={
          generation.outputs.length === 1
            ? "grid max-w-2xl grid-cols-1 gap-4"
            : "grid grid-cols-1 gap-4 sm:grid-cols-2"
        }
      >
        {generation.outputs.map((output) => (
          <OutputCard
            key={output._id}
            onOpen={setSelectedOutput}
            output={output}
          />
        ))}
      </div>

      {generation.status === "partial" ? (
        <p
          className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
          role="status"
        >
          The provider returned fewer images than requested. Completed outputs
          were saved.
        </p>
      ) : generation.status === "failed" ? (
        <p
          className="mt-4 rounded-lg bg-destructive/8 px-3 py-2 text-xs leading-relaxed text-destructive"
          role="alert"
        >
          This generation could not be completed. Your prompt and settings are
          ready to retry.
        </p>
      ) : null}

      <Dialog
        open={Boolean(selectedOutput)}
        onOpenChange={(open) => !open && setSelectedOutput(null)}
      >
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Generated image</DialogTitle>
            <DialogDescription>
              {generation.model} · {generation.config.dimension}
            </DialogDescription>
          </DialogHeader>
          {selectedOutput?.url ? (
            <img
              alt={generation.prompt}
              className="max-h-[70svh] w-full rounded-lg bg-muted/30 object-contain"
              src={selectedOutput.url}
            />
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            {selectedOutput?.url ? (
              <>
                <Button
                  onClick={() => onUseAsReference(selectedOutput)}
                  type="button"
                  variant="outline"
                >
                  <ImagePlus aria-hidden="true" />
                  Use as reference
                </Button>
                <Button
                  onClick={() =>
                    void downloadLibraryAsset(
                      selectedOutput.url!,
                      selectedOutput.name ??
                        `generated-${selectedOutput.ordinal + 1}.png`
                    )
                  }
                  type="button"
                >
                  <Download aria-hidden="true" />
                  Download
                </Button>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
