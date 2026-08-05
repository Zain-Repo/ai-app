"use client"

import { Check, ChevronDown, Copy, Pencil, RotateCcw } from "lucide-react"
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
  message,
  onCopy,
  onEdit,
  onRetry,
  onSelectBranch,
  retryModels,
}: {
  actionsDisabled: boolean
  bubbleClassName?: string
  children: ReactNode
  copied: boolean
  message: ChatMessageRowMessage
  onCopy: () => void
  onEdit: () => void
  onRetry: (model?: string) => void
  onSelectBranch: (branchId: Id<"conversationBranches">) => void
  retryModels: Array<{ label: string; value: string }>
}) {
  const isUser = message.role === "user"
  const actionsAvailable =
    isUser ||
    message.status === "complete" ||
    message.status === "failed" ||
    message.status === "stopped"
  const branch = message.branchNavigation

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
        </MessageContent>
      </Message>
    </MessageScrollerItem>
  )
}
