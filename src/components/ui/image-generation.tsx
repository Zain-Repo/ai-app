"use client"

import * as React from "react"
import { LoaderCircle } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"

export interface ImageGenerationProps {
  children: React.ReactNode
  completed?: boolean
}

function formatElapsed(seconds: number) {
  if (seconds < 60) return `${seconds}s elapsed`
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder.toString().padStart(2, "0")}s elapsed`
}

/** Displays provider-backed state without inventing a completion percentage. */
export function ImageGeneration({
  children,
  completed = false,
}: ImageGenerationProps) {
  const reduceMotion = useReducedMotion() === true
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0)

  React.useEffect(() => {
    if (completed) return
    const startedAt = Date.now()
    const interval = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)),
      1_000
    )
    return () => window.clearInterval(interval)
  }, [completed])

  const title = completed ? "Image ready" : "Creating image"
  const detail = completed
    ? "Your finished image is ready to view."
    : `${formatElapsed(elapsedSeconds)}. The provider has not reported a percentage.`

  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex items-start gap-2">
        {completed ? (
          <span
            aria-hidden="true"
            className="mt-1 size-2 rounded-full bg-emerald-500"
          />
        ) : (
          <LoaderCircle
            aria-hidden="true"
            className="mt-0.5 size-4 animate-spin text-primary motion-reduce:animate-none"
          />
        )}
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {title}
      </span>
      {!completed ? (
        <div
          aria-label="Image generation is in progress"
          className="h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
        >
          <motion.div
            animate={reduceMotion ? { x: 0 } : { x: ["-100%", "300%"] }}
            className="h-full w-1/3 rounded-full bg-primary/70"
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 1.8, ease: "linear", repeat: Infinity }
            }
          />
        </div>
      ) : null}
      <motion.div
        animate={{ opacity: 1 }}
        aria-busy={!completed}
        className="overflow-hidden rounded-xl border bg-card shadow-sm"
        initial={completed && !reduceMotion ? { opacity: 0.65 } : false}
        transition={{ duration: reduceMotion ? 0 : 0.25 }}
      >
        {children}
      </motion.div>
    </div>
  )
}

ImageGeneration.displayName = "ImageGeneration"
