"use client"

import * as React from "react"
import { motion, useReducedMotion } from "motion/react"

export interface ImageGenerationProps {
  children: React.ReactNode
  completed?: boolean
}

const DURATION_MS = 30_000
const STARTING_MS = 3_000

export function ImageGeneration({
  children,
  completed = false,
}: ImageGenerationProps) {
  const reduceMotion = useReducedMotion() === true
  const [progress, setProgress] = React.useState(completed ? 100 : 0)
  const [loadingState, setLoadingState] = React.useState<
    "starting" | "generating" | "completed"
  >(completed ? "completed" : "starting")

  React.useEffect(() => {
    if (completed) {
      setProgress(100)
      setLoadingState("completed")
      return
    }

    let interval: ReturnType<typeof setInterval> | undefined
    const startingTimeout = setTimeout(() => {
      setLoadingState("generating")
      if (reduceMotion) return

      const startedAt = Date.now()
      interval = setInterval(() => {
        setProgress(
          Math.min(95, ((Date.now() - startedAt) / DURATION_MS) * 100)
        )
      }, 16)
    }, STARTING_MS)

    return () => {
      clearTimeout(startingTimeout)
      if (interval) clearInterval(interval)
    }
  }, [completed, reduceMotion])

  return (
    <div className="flex flex-col gap-2">
      <motion.span
        animate={{
          backgroundPosition: loadingState === "completed" ? "0% 0" : "-200% 0",
        }}
        aria-live="polite"
        className="bg-[linear-gradient(110deg,var(--color-muted-foreground),35%,var(--color-foreground),50%,var(--color-muted-foreground),75%,var(--color-muted-foreground))] bg-[length:200%_100%] bg-clip-text text-base font-medium text-transparent"
        initial={{ backgroundPosition: "200% 0" }}
        role="status"
        transition={{
          repeat: reduceMotion || loadingState === "completed" ? 0 : Infinity,
          duration: reduceMotion ? 0 : 3,
          ease: "linear",
        }}
      >
        {loadingState === "starting" && "Getting started."}
        {loadingState === "generating" && "Creating image. May take a moment."}
        {loadingState === "completed" && "Image created."}
      </motion.span>
      <div className="relative max-w-md overflow-hidden rounded-xl border bg-card">
        {children}
        <motion.div
          animate={{
            clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            opacity: loadingState === "completed" ? 0 : 1,
          }}
          aria-hidden="true"
          className="pointer-events-none absolute -top-[25%] h-[125%] w-full backdrop-blur-3xl"
          initial={false}
          style={{
            clipPath: `polygon(0 ${progress}%, 100% ${progress}%, 100% 100%, 0 100%)`,
            maskImage:
              progress === 0
                ? "linear-gradient(to bottom, black -5%, black 100%)"
                : `linear-gradient(to bottom, transparent ${progress - 5}%, transparent ${progress}%, black ${progress + 5}%)`,
            WebkitMaskImage:
              progress === 0
                ? "linear-gradient(to bottom, black -5%, black 100%)"
                : `linear-gradient(to bottom, transparent ${progress - 5}%, transparent ${progress}%, black ${progress + 5}%)`,
          }}
          transition={{ duration: reduceMotion ? 0 : 0.2 }}
        />
      </div>
    </div>
  )
}

ImageGeneration.displayName = "ImageGeneration"
