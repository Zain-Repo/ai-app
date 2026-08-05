"use client"

import * as React from "react"
import {
  Check,
  Copy,
  RefreshCw,
  Share2,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

type FeedbackType = "negative" | "positive" | null
type CopyStatus = "copied" | "failed" | "idle"

interface AiResponseActionsProps {
  className?: string
  compact?: boolean
  content?: string
  onCopyError?: (error: Error) => void
  onFeedback?: (type: FeedbackType) => void
  onRegenerate?: () => void
  onShare?: () => void
}

const COPY_STATUS_DURATION_MS = 2_000

function AiResponseActions({
  className,
  compact = false,
  content,
  onCopyError,
  onFeedback,
  onRegenerate,
  onShare,
}: AiResponseActionsProps) {
  const [copyStatus, setCopyStatus] = React.useState<CopyStatus>("idle")
  const [feedback, setFeedback] = React.useState<FeedbackType>(null)
  const copyStatusTimeout =
    React.useRef<ReturnType<typeof setTimeout>>(undefined)

  // Copy feedback is transient; cancel its reset when the toolbar unmounts.
  React.useEffect(
    () => () => {
      clearTimeout(copyStatusTimeout.current)
    },
    []
  )

  const updateCopyStatus = React.useCallback((status: CopyStatus) => {
    clearTimeout(copyStatusTimeout.current)
    setCopyStatus(status)
    copyStatusTimeout.current = setTimeout(
      () => setCopyStatus("idle"),
      COPY_STATUS_DURATION_MS
    )
  }, [])

  const handleCopy = React.useCallback(async () => {
    if (!content) return

    try {
      await navigator.clipboard.writeText(content)
      updateCopyStatus("copied")
    } catch (error) {
      const copyError =
        error instanceof Error
          ? error
          : new Error("Response could not be copied")
      updateCopyStatus("failed")
      onCopyError?.(copyError)
    }
  }, [content, onCopyError, updateCopyStatus])

  const handleFeedback = React.useCallback(
    (type: Exclude<FeedbackType, null>) => {
      const nextFeedback = feedback === type ? null : type
      setFeedback(nextFeedback)
      onFeedback?.(nextFeedback)
    },
    [feedback, onFeedback]
  )

  const buttonSize = compact ? "icon-xs" : "icon-sm"
  const iconSize = compact ? "size-3" : "size-3.5"
  const hasActions = Boolean(content || onRegenerate || onFeedback || onShare)

  if (!hasActions) return null

  const copyLabel =
    copyStatus === "copied"
      ? "Response copied"
      : copyStatus === "failed"
        ? "Copy failed"
        : "Copy response"

  return (
    <TooltipProvider delay={300}>
      <div
        aria-label="Response actions"
        className={cn(
          "inline-flex items-center gap-0.5 rounded-lg border bg-background p-0.5",
          className
        )}
        data-slot="ai-response-actions"
        role="toolbar"
      >
        {content ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label={copyLabel}
                  onClick={() => void handleCopy()}
                  size={buttonSize}
                  type="button"
                  variant="ghost"
                />
              }
            >
              {copyStatus === "copied" ? (
                <Check className={cn(iconSize, "text-success-foreground")} />
              ) : (
                <Copy className={iconSize} />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{copyLabel}</p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        {onRegenerate ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Regenerate response"
                  onClick={onRegenerate}
                  size={buttonSize}
                  type="button"
                  variant="ghost"
                />
              }
            >
              <RefreshCw className={iconSize} />
            </TooltipTrigger>
            <TooltipContent>
              <p>Regenerate response</p>
            </TooltipContent>
          </Tooltip>
        ) : null}

        {onFeedback ? (
          <>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Mark response as helpful"
                    aria-pressed={feedback === "positive"}
                    className={cn(
                      feedback === "positive" &&
                        "bg-success-fill text-success-foreground"
                    )}
                    onClick={() => handleFeedback("positive")}
                    size={buttonSize}
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <ThumbsUp className={iconSize} />
              </TooltipTrigger>
              <TooltipContent>
                <p>Helpful response</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Mark response as unhelpful"
                    aria-pressed={feedback === "negative"}
                    className={cn(
                      feedback === "negative" &&
                        "bg-destructive/10 text-destructive"
                    )}
                    onClick={() => handleFeedback("negative")}
                    size={buttonSize}
                    type="button"
                    variant="ghost"
                  />
                }
              >
                <ThumbsDown className={iconSize} />
              </TooltipTrigger>
              <TooltipContent>
                <p>Unhelpful response</p>
              </TooltipContent>
            </Tooltip>
          </>
        ) : null}

        {onShare ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Share response"
                  onClick={onShare}
                  size={buttonSize}
                  type="button"
                  variant="ghost"
                />
              }
            >
              <Share2 className={iconSize} />
            </TooltipTrigger>
            <TooltipContent>
              <p>Share response</p>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </TooltipProvider>
  )
}

export { AiResponseActions }
export type { AiResponseActionsProps, FeedbackType }
