"use client"

import { Check, ChevronDown, Copy, Pencil, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react"
import type { ReactNode } from "react"

import type { Id } from "../../convex/_generated/dataModel"
import {
  MessageAction,
  MessageActions,
  MessageBranch,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageToolbar,
} from "@/components/ai-elements/message-controls"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ResponseSources, type ResponseSource } from "@/components/response-sources"
import { Message, MessageContent } from "@/components/ui/message"
import { MessageScrollerItem } from "@/components/ui/message-scroller"
import { cn } from "@/lib/utils"

export type ChatMessageBranchNavigation = {
  branchId: Id<"conversationBranches">
  index: number
  nextBranchId?: Id<"conversationBranches">
  previousBranchId?: Id<"conversationBranches">
  total: number
}

export type AssistantResponseFeedbackRating = "negative" | "positive"

export async function copyMessageText(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> = navigator.clipboard
) {
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

type ChatMessageRowMessage = {
  _id: Id<"messages">
  branchNavigation?: ChatMessageBranchNavigation
  content: string
  model?: string
  role: "assistant" | "system" | "user"
  status: "complete" | "failed" | "pending" | "stopped" | "streaming"
}

export function ChatMessageRow({
  actionsDisabled,
  bubbleClassName,
  children,
  copied,
  feedback,
  message,
  onCopy,
  onEdit,
  onFeedback,
  onRetry,
  onSelectBranch,
  retryModels,
  sources,
}: {
  actionsDisabled: boolean
  bubbleClassName?: string
  children: ReactNode
  copied: boolean
  feedback?: AssistantResponseFeedbackRating | null
  message: ChatMessageRowMessage
  onCopy: () => void
  onEdit: () => void
  onFeedback?: (rating: AssistantResponseFeedbackRating | null) => void
  onRetry: (model?: string) => void
  onSelectBranch: (branchId: Id<"conversationBranches">) => void
  retryModels: Array<{ label: string; value: string }>
  sources?: ResponseSource[]
}) {
  const isUser = message.role === "user"
  const actionsAvailable =
    isUser ||
    message.status === "complete" ||
    message.status === "failed" ||
    message.status === "stopped"
  const branch = message.branchNavigation
  const canRateResponse =
    !isUser &&
    message.status === "complete" &&
    Boolean(message.content.trim()) &&
    Boolean(onFeedback)

  const toolbar = actionsAvailable ? (
    <MessageToolbar
      className={cn(
        "transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/message-row:opacity-100 [@media(hover:hover)]:group-hover/message-row:opacity-100",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <MessageActions>
        {isUser || message.content ? (
          <MessageAction
            disabled={actionsDisabled}
            label={
              copied ? "Copied" : isUser ? "Copy message" : "Copy response"
            }
            onClick={onCopy}
            tooltip={copied ? "Copied" : "Copy"}
          >
            {copied ? (
              <Check aria-hidden="true" className="size-4" />
            ) : (
              <Copy aria-hidden="true" className="size-4" />
            )}
          </MessageAction>
        ) : null}
        {isUser ? (
          <MessageAction
            disabled={actionsDisabled}
            label="Edit message"
            onClick={onEdit}
            tooltip="Edit"
          >
            <Pencil aria-hidden="true" className="size-4" />
          </MessageAction>
        ) : (
          <>
            <MessageAction
              disabled={actionsDisabled}
              label="Retry response"
              onClick={() => onRetry()}
              tooltip="Retry"
            >
              <RotateCcw aria-hidden="true" className="size-4" />
            </MessageAction>
            {retryModels.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      aria-label="Retry with another model"
                      disabled={actionsDisabled}
                      size="icon-sm"
                      type="button"
                      variant="ghost"
                    />
                  }
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {retryModels.map((model) => (
                    <DropdownMenuItem
                      key={model.value}
                      onClick={() => onRetry(model.value)}
                    >
                      {model.label}
                      {model.value === message.model ? " (original)" : ""}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canRateResponse ? (
              <>
                <MessageAction
                  aria-pressed={feedback === "positive"}
                  className={cn(
                    feedback === "positive" &&
                      "bg-success-fill text-success-foreground"
                  )}
                  disabled={actionsDisabled}
                  label="Mark response as helpful"
                  onClick={() =>
                    onFeedback?.(
                      feedback === "positive" ? null : "positive"
                    )
                  }
                  tooltip="Helpful response"
                >
                  <ThumbsUp aria-hidden="true" className="size-4" />
                </MessageAction>
                <MessageAction
                  aria-pressed={feedback === "negative"}
                  className={cn(
                    feedback === "negative" &&
                      "bg-destructive/10 text-destructive"
                  )}
                  disabled={actionsDisabled}
                  label="Mark response as unhelpful"
                  onClick={() =>
                    onFeedback?.(
                      feedback === "negative" ? null : "negative"
                    )
                  }
                  tooltip="Unhelpful response"
                >
                  <ThumbsDown aria-hidden="true" className="size-4" />
                </MessageAction>
              </>
            ) : null}
          </>
        )}
        {!isUser && branch ? (
          <MessageBranch
            branch={branch.index}
            branchCount={branch.total}
            onBranchChange={(index) => {
              const branchId =
                index < branch.index
                  ? branch.previousBranchId
                  : branch.nextBranchId
              if (branchId) onSelectBranch(branchId)
            }}
          >
            <MessageBranchSelector>
              <MessageBranchPrevious disabled={actionsDisabled} />
              <MessageBranchPage />
              <MessageBranchNext disabled={actionsDisabled} />
            </MessageBranchSelector>
          </MessageBranch>
        ) : null}
      </MessageActions>
    </MessageToolbar>
  ) : null

  const sourceList = sources && sources.length > 0 ? (
    <ResponseSources sources={sources} />
  ) : null

  return (
    <MessageScrollerItem
      className="group/message-row focus-visible:rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      id={"message-" + message._id}
      tabIndex={-1}
    >
      <Message align={isUser ? "end" : "start"}>
        <MessageContent>
          <Bubble
            align={isUser ? "end" : "start"}
            variant={isUser ? "default" : "ghost"}
          >
            <BubbleContent className={bubbleClassName}>
              {children}
            </BubbleContent>
          </Bubble>
          {toolbar}
          {sourceList}
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}

