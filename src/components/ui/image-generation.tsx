"use client"

import * as React from "react"
import {
  AnimatePresence,
  motion,
  useInView,
  useReducedMotion,
} from "motion/react"

export interface ImageGenerationProps {
  children: React.ReactNode
  completed?: boolean
}

type LoadingState = "starting" | "generating" | "completed"

const DURATION_MS = 30_000
const MAX_ESTIMATED_PROGRESS = 94
const PROGRESS_UPDATE_MS = 250
const STAGE_DURATION_MS = 6_000
const STARTING_MS = 3_000
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const

const GENERATION_STAGES = [
  "Sketching the first shapes.",
  "Building the composition.",
  "Balancing light and color.",
  "Adding the finer details.",
  "Finishing the final touches.",
] as const

const LOADING_COPY: Record<
  Exclude<LoadingState, "generating">,
  { detail: string; title: string }
> = {
  starting: {
    detail: "Setting up the canvas and creative direction.",
    title: "Preparing image",
  },
  completed: {
    detail: "Your finished image is ready to view.",
    title: "Image ready",
  },
}

export function ImageGeneration({
  children,
  completed = false,
}: ImageGenerationProps) {
  const reduceMotion = useReducedMotion() === true
  const containerRef = React.useRef<HTMLDivElement>(null)
  const completedOnMount = React.useRef(completed)
  const generationStartedAt = React.useRef<number | undefined>(undefined)
  const isInView = useInView(containerRef, { amount: 0.1 })
  const [documentVisible, setDocumentVisible] = React.useState(true)
  const [progress, setProgress] = React.useState(completed ? 100 : 0)
  const [stageIndex, setStageIndex] = React.useState(0)
  const [loadingState, setLoadingState] = React.useState<LoadingState>(
    completed ? "completed" : "starting"
  )

  React.useEffect(() => {
    const updateVisibility = () =>
      setDocumentVisible(document.visibilityState !== "hidden")

    updateVisibility()
    document.addEventListener("visibilitychange", updateVisibility)
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility)
  }, [])

  React.useEffect(() => {
    if (!completed) return

    setProgress(100)
    setStageIndex(GENERATION_STAGES.length - 1)
    setLoadingState("completed")
  }, [completed])

  React.useEffect(() => {
    if (completed || loadingState !== "starting") return

    const startingTimeout = setTimeout(() => {
      generationStartedAt.current = Date.now()
      setProgress(reduceMotion ? 12 : 6)
      setLoadingState("generating")
    }, STARTING_MS)

    return () => clearTimeout(startingTimeout)
  }, [completed, loadingState, reduceMotion])

  React.useEffect(() => {
    if (
      completed ||
      loadingState !== "generating" ||
      !documentVisible ||
      !isInView
    ) {
      return
    }

    const updateGeneration = () => {
      const startedAt = generationStartedAt.current ?? Date.now()
      generationStartedAt.current = startedAt
      const elapsed = Date.now() - startedAt

      setStageIndex(
        Math.min(
          GENERATION_STAGES.length - 1,
          Math.floor(elapsed / STAGE_DURATION_MS)
        )
      )

      // This is an estimated wait indicator, so it stops short of completion
      // until the backend delivers the generated image.
      if (!reduceMotion) {
        setProgress(
          Math.min(MAX_ESTIMATED_PROGRESS, (elapsed / DURATION_MS) * 100)
        )
      }
    }

    updateGeneration()
    const interval = setInterval(
      updateGeneration,
      reduceMotion ? STAGE_DURATION_MS : PROGRESS_UPDATE_MS
    )

    return () => clearInterval(interval)
  }, [completed, documentVisible, isInView, loadingState, reduceMotion])

  const copy =
    loadingState === "generating"
      ? {
          detail: GENERATION_STAGES[stageIndex],
          title: "Creating image",
        }
      : LOADING_COPY[loadingState]
  const displayProgress = Math.round(progress)
  const animationsActive =
    !reduceMotion && documentVisible && isInView && loadingState !== "completed"
  const revealCompletedImage =
    completed && !completedOnMount.current && !reduceMotion

  return (
    <div className="flex max-w-md flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <div aria-hidden="true" className="min-w-0">
          <div className="flex items-center gap-2">
            <motion.span
              animate={
                animationsActive
                  ? { opacity: [0.45, 1, 0.45], scale: [0.8, 1, 0.8] }
                  : { opacity: 1, scale: 1 }
              }
              className="size-1.5 shrink-0 rounded-full bg-foreground"
              transition={
                animationsActive
                  ? { duration: 1.8, ease: "easeInOut", repeat: Infinity }
                  : { duration: 0.2 }
              }
            />
            <span className="text-sm font-medium text-foreground">
              {copy.title}
            </span>
          </div>
          <AnimatePresence initial={false} mode="wait">
            <motion.p
              animate={{ filter: "blur(0px)", opacity: 1, y: 0 }}
              className="mt-0.5 truncate text-sm text-muted-foreground"
              exit={
                reduceMotion
                  ? { opacity: 1 }
                  : { filter: "blur(2px)", opacity: 0, y: -3 }
              }
              initial={
                reduceMotion ? false : { filter: "blur(2px)", opacity: 0, y: 3 }
              }
              key={copy.detail}
              transition={{ duration: reduceMotion ? 0 : 0.18 }}
            >
              {copy.detail}
            </motion.p>
          </AnimatePresence>
        </div>
        <span
          aria-hidden="true"
          className="pt-0.5 text-xs text-muted-foreground tabular-nums"
        >
          {displayProgress}%
        </span>
      </div>

      <span
        aria-atomic="true"
        aria-live="polite"
        className="sr-only"
        role="status"
      >
        {copy.title}. {copy.detail}
      </span>

      <div
        aria-label="Image generation progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={displayProgress}
        aria-valuetext={copy.detail}
        className="h-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
      >
        <motion.div
          animate={{ scaleX: progress / 100 }}
          className="relative h-full origin-left overflow-hidden rounded-full bg-foreground/70"
          initial={false}
          transition={{
            duration: reduceMotion ? 0 : 0.45,
            ease: EASE_OUT_EXPO,
          }}
        >
          <motion.span
            animate={
              animationsActive ? { x: ["-120%", "320%"] } : { x: "320%" }
            }
            className="absolute inset-y-0 w-1/3 bg-linear-to-r from-transparent via-background/70 to-transparent"
            transition={
              animationsActive
                ? { duration: 2.4, ease: "linear", repeat: Infinity }
                : { duration: 0 }
            }
          />
        </motion.div>
      </div>

      <div
        aria-busy={loadingState !== "completed"}
        className="relative isolate overflow-hidden rounded-xl border bg-card shadow-sm"
        ref={containerRef}
      >
        <motion.div
          animate={{
            clipPath: "inset(0 0 0% 0)",
            filter: "saturate(1) brightness(1)",
          }}
          initial={
            revealCompletedImage
              ? {
                  clipPath: "inset(0 0 100% 0)",
                  filter: "saturate(0.75) brightness(1.08)",
                }
              : false
          }
          key={completed ? "completed-image" : "pending-image"}
          transition={{
            duration: revealCompletedImage ? 1.15 : 0,
            ease: EASE_OUT_EXPO,
          }}
        >
          {children}
        </motion.div>

        <motion.div
          animate={
            loadingState === "completed"
              ? { backgroundPosition: "50% 50%", opacity: 0 }
              : animationsActive
                ? {
                    backgroundPosition: ["10% 10%", "90% 65%", "20% 90%"],
                    opacity: [0.55, 0.85, 0.55],
                  }
                : { backgroundPosition: "50% 50%", opacity: 0.58 }
          }
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[length:170%_170%]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 18%, color-mix(in oklch, var(--primary) 16%, transparent), transparent 42%), radial-gradient(circle at 82% 76%, color-mix(in oklch, var(--muted-foreground) 12%, transparent), transparent 46%)",
          }}
          transition={
            animationsActive
              ? { duration: 9, ease: "easeInOut", repeat: Infinity }
              : { duration: 0.25 }
          }
        />

        <motion.div
          animate={{
            clipPath:
              loadingState === "completed"
                ? "inset(100% 0 0 0)"
                : `inset(${progress}% 0 0 0)`,
            opacity: loadingState === "completed" ? 0 : 1,
          }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-card/65 backdrop-blur-2xl"
          initial={false}
          transition={{ duration: reduceMotion ? 0 : 0.4, ease: "linear" }}
        />

        <motion.div
          animate={{
            opacity: loadingState === "completed" ? 0 : 1,
            y: `${progress}%`,
          }}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-full"
          initial={false}
          transition={{ duration: reduceMotion ? 0 : 0.4, ease: "linear" }}
        >
          <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/45 to-transparent shadow-[0_6px_18px_color-mix(in_oklch,var(--foreground)_18%,transparent)]" />
          <div className="absolute inset-x-8 top-0 h-6 -translate-y-1/2 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--foreground)_12%,transparent),transparent_68%)]" />
        </motion.div>

        {revealCompletedImage ? (
          <motion.div
            animate={{ opacity: [0, 0.9, 0], y: "104%" }}
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-full"
            initial={{ opacity: 0, y: "-4%" }}
            transition={{ duration: 1.15, ease: EASE_OUT_EXPO }}
          >
            <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/55 to-transparent shadow-[0_8px_24px_color-mix(in_oklch,var(--foreground)_22%,transparent)]" />
          </motion.div>
        ) : null}
      </div>
    </div>
  )
}

ImageGeneration.displayName = "ImageGeneration"
