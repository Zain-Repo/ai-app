// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import type * as ConvexReact from "convex/react"
import type { ComponentProps } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { SidebarProvider } from "@/components/ui/sidebar"
import {
  CappedConversationList,
  getConnectedProviderOptions,
  getCurrentCatalogModels,
  getExecutionProviderOptions,
  getPreferredProvider,
  getWorkspaceSwitchSearch,
  isConversationWorkspacePending,
  isActiveProvider,
  MessageArea,
  normalizeWorkspaceProduct,
  OptionalChatFeatureBoundary,
  ProjectConversationDisclosure,
  resolveActiveProjectId,
  resolveActiveWorkspace,
  SidebarConversationLabel,
  toggleExpandedProject,
} from "./chat.{-$slug}"
import { getWorkspaceOutputMode } from "@/lib/workspace-product"

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }))

class ResizeObserverMock implements ResizeObserver {
  disconnect() {}
  observe() {}
  unobserve() {}
}

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useQuery: useQueryMock,
}))

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock
  useQueryMock.mockReset()
  useQueryMock.mockReturnValue(undefined)
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      media: query,
      removeEventListener: vi.fn(),
    })),
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

afterEach(cleanup)

describe("workspace routing", () => {
  it("defaults missing and invalid workspace search values to Chat", () => {
    expect(normalizeWorkspaceProduct(undefined)).toBe("chat")
    expect(normalizeWorkspaceProduct("video")).toBe("chat")
    expect(normalizeWorkspaceProduct("image")).toBe("image")
  })

  it("clears conversation context when switching workspaces", () => {
    expect(getWorkspaceSwitchSearch("image")).toEqual({
      workspace: "image",
      mode: undefined,
      projectId: undefined,
      messageId: undefined,
    })
  })

  it("canonicalizes opened conversations from their stored output mode", () => {
    expect(resolveActiveWorkspace("chat", "image", true)).toBe("image")
    expect(resolveActiveWorkspace("image", "text", true)).toBe("chat")
    expect(resolveActiveWorkspace("image", undefined, true)).toBe("chat")
    expect(resolveActiveWorkspace("image", undefined, false)).toBe("image")
  })

  it("derives generation output mode from the active workspace", () => {
    expect(
      getWorkspaceOutputMode(resolveActiveWorkspace("image", undefined, false))
    ).toBe("image")
    expect(
      getWorkspaceOutputMode(resolveActiveWorkspace("chat", undefined, false))
    ).toBe("text")
  })

  it("withholds workspace controls until a deep-linked conversation loads", () => {
    expect(isConversationWorkspacePending("conversation-id", undefined)).toBe(
      true
    )
    expect(isConversationWorkspacePending("conversation-id", null)).toBe(false)
    expect(isConversationWorkspacePending(undefined, undefined)).toBe(false)
  })
})

describe("optional chat features", () => {
  it("contains a failed optional feature without replacing chat", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const FailedFeature = () => {
      throw new Error("Backend function unavailable")
    }

    try {
      const view = render(
        <OptionalChatFeatureBoundary
          fallback={<span>Feature unavailable</span>}
        >
          <FailedFeature />
        </OptionalChatFeatureBoundary>
      )
      expect(view.getByText("Feature unavailable")).toBeTruthy()
    } finally {
      consoleError.mockRestore()
    }
  })

  it("keeps messages visible when the response-source query fails", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const messages = [
      {
        _id: "message-1",
        attachments: [],
        content: "Chat remains available",
        role: "user",
        status: "complete",
      },
    ] as unknown as NonNullable<ComponentProps<typeof MessageArea>["messages"]>
    useQueryMock.mockImplementationOnce(() => {
      throw new Error("Backend function unavailable")
    })

    try {
      const view = render(
        <MessageArea
          actionsDisabled={false}
          conversationId={"conversation-1" as Id<"conversations">}
          messages={messages}
          name={null}
          onAction={vi.fn()}
          onManageMemory={vi.fn()}
          userMessageBubbleColor={undefined}
          workspace="chat"
        />,
        { onRecoverableError: () => {} }
      )
      expect(view.getByText("Chat remains available")).toBeTruthy()
    } finally {
      consoleError.mockRestore()
    }
  })

  it("submits a workspace-specific starter prompt from an empty chat", () => {
    const onAction = vi.fn()
    const view = render(
      <MessageArea
        actionsDisabled={false}
        conversationId={undefined}
        messages={[]}
        name={null}
        onAction={onAction}
        onManageMemory={vi.fn()}
        userMessageBubbleColor={undefined}
        workspace="image"
      />
    )

    fireEvent.click(view.getByRole("button", { name: /Product hero/ }))

    expect(onAction).toHaveBeenCalledWith(
      expect.stringContaining("product hero image")
    )
  })

  it("renders pending and streamed commentary with the reasoning component", () => {
    const messages = [
      {
        _id: "assistant-pending",
        attachments: [],
        content: "",
        outputMode: "text",
        role: "assistant",
        status: "pending",
      },
      {
        _id: "assistant-commentary",
        attachments: [],
        content: "",
        outputMode: "text",
        reasoningSteps: ["I am checking the current image-generation lineup."],
        role: "assistant",
        status: "streaming",
      },
    ] as unknown as NonNullable<ComponentProps<typeof MessageArea>["messages"]>
    const view = render(
      <MessageArea
        actionsDisabled={false}
        conversationId={"conversation-1" as Id<"conversations">}
        messages={messages}
        name={null}
        onAction={vi.fn()}
        onManageMemory={vi.fn()}
        userMessageBubbleColor={undefined}
        workspace="chat"
      />
    )

    expect(view.getAllByRole("button", { name: /Thinking/ })).toHaveLength(2)
    expect(
      view.getAllByText("I am checking the current image-generation lineup.")
    ).toHaveLength(2)
    expect(view.getAllByText("Preparing response")).toHaveLength(2)
  })

  it("shows copy actions for user messages and terminal assistant text", () => {
    const messages = [
      {
        _id: "assistant-complete",
        attachments: [],
        content: "Completed assistant response",
        outputMode: "text",
        role: "assistant",
        status: "complete",
      },
      {
        _id: "user-complete",
        attachments: [],
        content: "Completed user message",
        outputMode: "text",
        role: "user",
        status: "complete",
      },
      {
        _id: "assistant-streaming",
        attachments: [],
        content: "Streaming assistant response",
        outputMode: "text",
        role: "assistant",
        status: "streaming",
      },
      {
        _id: "assistant-failed",
        attachments: [],
        content: "Failed assistant response",
        outputMode: "text",
        role: "assistant",
        status: "failed",
      },
    ] as unknown as NonNullable<ComponentProps<typeof MessageArea>["messages"]>
    const view = render(
      <MessageArea
        actionsDisabled={false}
        conversationId={"conversation-1" as Id<"conversations">}
        messages={messages}
        name={null}
        onAction={vi.fn()}
        onManageMemory={vi.fn()}
        userMessageBubbleColor={undefined}
        workspace="chat"
      />
    )

    expect(view.getAllByRole("button", { name: "Copy response" })).toHaveLength(
      2
    )
    expect(view.getByRole("button", { name: "Copy message" })).toBeTruthy()
  })

  it("focuses the message opened from Library", () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    const messages = [
      {
        _id: "message-1",
        attachments: [],
        content: "Original Library context",
        role: "user",
        status: "complete",
      },
    ] as unknown as NonNullable<ComponentProps<typeof MessageArea>["messages"]>

    const view = render(
      <MessageArea
        actionsDisabled={false}
        conversationId={"conversation-1" as Id<"conversations">}
        messages={messages}
        name={null}
        onAction={vi.fn()}
        onManageMemory={vi.fn()}
        targetMessageId="message-1"
        userMessageBubbleColor={undefined}
        workspace="chat"
      />
    )

    expect(document.activeElement).toBe(
      view.container.querySelector("#message-message-1")
    )

    view.rerender(
      <MessageArea
        actionsDisabled={false}
        conversationId={"conversation-1" as Id<"conversations">}
        messages={[...messages]}
        name={null}
        onAction={vi.fn()}
        onManageMemory={vi.fn()}
        targetMessageId="message-1"
        userMessageBubbleColor={undefined}
        workspace="chat"
      />
    )

    expect(scrollIntoView).toHaveBeenCalledOnce()
  })
})

describe("project sidebar disclosure", () => {
  it("collapses the open project and expands a different project", () => {
    expect(toggleExpandedProject("website", "website")).toBeUndefined()
    expect(toggleExpandedProject(undefined, "website")).toBe("website")
    expect(toggleExpandedProject("website", "mobile")).toBe("mobile")
  })

  it("keeps chat titles mounted while the project animates", () => {
    const view = render(
      <ProjectConversationDisclosure open={false}>
        <span>Design system chat</span>
      </ProjectConversationDisclosure>
    )
    const title = view.getByText("Design system chat")

    view.rerender(
      <ProjectConversationDisclosure open>
        <span>Design system chat</span>
      </ProjectConversationDisclosure>
    )

    expect(view.getByText("Design system chat")).toBe(title)
  })
})

describe("sidebar conversation list", () => {
  it("shows ten chats before revealing the rest", () => {
    const conversations = Array.from({ length: 11 }, (_, index) => ({
      _id: `chat-${index}`,
      title: `Chat ${index + 1}`,
    })) as unknown as Doc<"conversations">[]
    const view = render(
      <SidebarProvider>
        <CappedConversationList
          conversations={conversations}
          renderConversation={(conversation) => (
            <span key={conversation._id}>{conversation.title}</span>
          )}
        />
      </SidebarProvider>
    )

    expect(view.getByText("Chat 10")).toBeTruthy()
    expect(view.queryByText("Chat 11")).toBeNull()

    fireEvent.click(view.getByRole("button", { name: "Show more" }))

    expect(view.getByText("Chat 11")).toBeTruthy()
    expect(view.queryByRole("button", { name: "Show more" })).toBeNull()
  })

  it("shows an accessible reduced-motion loader while the agent is working", () => {
    const view = render(
      <SidebarConversationLabel isWorking={false} title="Fix library" />
    )

    expect(view.queryByRole("status")).toBeNull()

    view.rerender(<SidebarConversationLabel isWorking title="Fix library" />)

    const loader = view.getByRole("status", {
      name: "Agent working on Fix library",
    })
    expect(loader.getAttribute("data-slot")).toBe("spinner")
    expect(loader.getAttribute("class")).toContain("motion-reduce:animate-none")
  })
})

describe("project chat header context", () => {
  it("separates chat membership from project workspace routing", () => {
    expect(resolveActiveProjectId(undefined, undefined, false, "website")).toBe(
      "website"
    )
    expect(
      resolveActiveProjectId("chat", undefined, false, "website")
    ).toBeUndefined()
    expect(resolveActiveProjectId("chat", "mobile", false, "website")).toBe(
      "mobile"
    )
    expect(resolveActiveProjectId("chat", "mobile", true, "website")).toBe(
      "website"
    )
  })
})

describe("connected provider selector", () => {
  const connections = [
    { provider: "openrouter", status: "connected" },
    { provider: "openai", status: "connected" },
    { provider: "fal", status: "connected" },
    { provider: "codex", status: "connected" },
    { provider: "cursor", status: "connected" },
    { provider: "anthropic", status: "connected" },
    { provider: "openai", status: "needs_reauthentication" },
  ]

  it("lists every selectable connected provider in display order on desktop", () => {
    expect(getConnectedProviderOptions(connections, true)).toEqual([
      {
        label: "ChatGPT subscription",
        provider: "codex",
        requiresDesktop: true,
      },
      {
        label: "Cursor Agent",
        provider: "cursor",
        requiresDesktop: true,
      },
      { label: "OpenAI", provider: "openai", requiresDesktop: false },
      {
        label: "OpenRouter",
        provider: "openrouter",
        requiresDesktop: false,
      },
      { label: "fal", provider: "fal", requiresDesktop: false },
    ])
  })

  it("does not reuse a catalog from another provider, connection, or output mode", () => {
    const openRouterCatalog = {
      connectionId: "openrouter-connection",
      provider: "openrouter" as const,
      models: [
        { outputMode: "text" as const, value: "openai/gpt-latest" },
        { outputMode: "image" as const, value: "openai/gpt-image-latest" },
      ],
    }

    expect(
      getCurrentCatalogModels(
        openRouterCatalog,
        "openrouter",
        "openrouter-connection"
      ).filter((model) => model.outputMode === "image")
    ).toEqual([{ outputMode: "image", value: "openai/gpt-image-latest" }])
    expect(
      getCurrentCatalogModels(openRouterCatalog, "openai", "openai-connection")
    ).toEqual([])
    expect(
      getCurrentCatalogModels(
        openRouterCatalog,
        "openrouter",
        "reconnected-openrouter"
      )
    ).toEqual([])
  })

  it("excludes disconnected and desktop-only providers in the web app", () => {
    expect(
      getConnectedProviderOptions(
        [
          { provider: "cursor", status: "connected" },
          { provider: "codex", status: "connected" },
          { provider: "openai", status: "disconnected" },
          { provider: "openrouter", status: "connected" },
        ],
        false
      )
    ).toEqual([
      {
        label: "OpenRouter",
        provider: "openrouter",
        requiresDesktop: false,
      },
    ])
  })

  it("prefers a provider with available chat support before Cursor", () => {
    expect(
      getPreferredProvider(getConnectedProviderOptions(connections, true))
    ).toBe("codex")
    expect(
      getPreferredProvider(
        getConnectedProviderOptions(
          [{ provider: "cursor", status: "connected" }],
          true
        )
      )
    ).toBe("cursor")
  })

  it("projects connected providers into the composer options", () => {
    const options = getConnectedProviderOptions(connections, true)

    expect(getExecutionProviderOptions(options, "text")).toEqual([
      { label: "ChatGPT subscription", value: "codex" },
      { label: "Cursor Agent", value: "cursor" },
      { label: "OpenAI", value: "openai" },
      { label: "OpenRouter", value: "openrouter" },
    ])
    expect(getExecutionProviderOptions(options, "image")).toEqual([
      { label: "OpenRouter", value: "openrouter" },
      { label: "fal", value: "fal" },
    ])
    expect(getPreferredProvider(options, "image")).toBe("openrouter")
  })

  it("guards provider changes before updating the active provider", () => {
    expect(isActiveProvider("openrouter")).toBe(true)
    expect(isActiveProvider("fal")).toBe(true)
    expect(isActiveProvider("anthropic")).toBe(false)
    expect(isActiveProvider("unknown")).toBe(false)
  })
})
