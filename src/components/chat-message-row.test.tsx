// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../convex/_generated/dataModel"
import { ChatMessageRow, copyMessageText } from "./chat-message-row"
import {
  MessageScroller,
  MessageScrollerProvider,
} from "@/components/ui/message-scroller"

afterEach(cleanup)

const assistantMessage = {
  _id: "message-1" as Id<"messages">,
  content: "Raw response text",
  model: "model-a",
  role: "assistant" as const,
  status: "complete" as const,
}

function renderRow(element: ReactNode) {
  return render(
    <MessageScrollerProvider>
      <MessageScroller>{element}</MessageScroller>
    </MessageScrollerProvider>
  )
}

describe("ChatMessageRow", () => {
  it("reports clipboard success and failure accurately", async () => {
    await expect(
      copyMessageText("raw text", {
        writeText: vi.fn().mockResolvedValue(null),
      })
    ).resolves.toBe(true)
    await expect(
      copyMessageText("raw text", {
        writeText: vi.fn().mockRejectedValue(new Error("denied")),
      })
    ).resolves.toBe(false)
  })

  it("exposes copy and retry actions for completed responses", () => {
    const onCopy = vi.fn()
    const onRetry = vi.fn()
    renderRow(
      <ChatMessageRow
        actionsDisabled={false}
        bubbleClassName="test-bubble"
        copied={false}
        message={assistantMessage}
        onCopy={onCopy}
        onEdit={vi.fn()}
        onRetry={onRetry}
        onSelectBranch={vi.fn()}
        retryModels={[{ label: "Model A", value: "model-a" }]}
      >
        Raw response text
      </ChatMessageRow>
    )

    fireEvent.click(screen.getByRole("button", { name: "Copy response" }))
    fireEvent.click(screen.getByRole("button", { name: "Retry response" }))
    expect(onCopy).toHaveBeenCalledOnce()
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it("toggles helpful and unhelpful response feedback", () => {
    const onFeedback = vi.fn()
    renderRow(
      <ChatMessageRow
        actionsDisabled={false}
        copied={false}
        feedback={null}
        message={assistantMessage}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onFeedback={onFeedback}
        onRetry={vi.fn()}
        onSelectBranch={vi.fn()}
        retryModels={[]}
      >
        Raw response text
      </ChatMessageRow>
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Mark response as helpful" })
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Mark response as unhelpful" })
    )
    expect(onFeedback).toHaveBeenNthCalledWith(1, "positive")
    expect(onFeedback).toHaveBeenNthCalledWith(2, "negative")
  })

  it("navigates a controlled response branch with accessible buttons", () => {
    const onSelectBranch = vi.fn()
    const previousBranchId = "previous-branch" as Id<"conversationBranches">
    renderRow(
      <ChatMessageRow
        actionsDisabled={false}
        copied={false}
        message={{
          ...assistantMessage,
          branchNavigation: {
            branchId: "current-branch" as Id<"conversationBranches">,
            index: 1,
            previousBranchId,
            total: 2,
          },
        }}
        onCopy={vi.fn()}
        onEdit={vi.fn()}
        onRetry={vi.fn()}
        onSelectBranch={onSelectBranch}
        retryModels={[]}
      >
        Raw response text
      </ChatMessageRow>
    )

    expect(screen.getByText("2 of 2")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Previous response" }))
    expect(onSelectBranch).toHaveBeenCalledWith(previousBranchId)
    expect(
      screen
        .getByRole("button", { name: "Next response" })
        .hasAttribute("disabled")
    ).toBe(true)
  })
})

