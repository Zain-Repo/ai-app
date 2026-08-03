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
  isActiveProvider,
  MessageArea,
  OptionalChatFeatureBoundary,
  ProjectConversationDisclosure,
  resolveActiveProjectId,
  toggleExpandedProject,
} from "./chat.{-$slug}"

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }))

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useQuery: useQueryMock,
}))

beforeEach(() => {
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
})

afterEach(cleanup)

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
        />,
        { onRecoverableError: () => {} }
      )
      expect(view.getByText("Chat remains available")).toBeTruthy()
    } finally {
      consoleError.mockRestore()
    }
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
    ])
  })

  it("guards provider changes before updating the active provider", () => {
    expect(isActiveProvider("openrouter")).toBe(true)
    expect(isActiveProvider("anthropic")).toBe(false)
    expect(isActiveProvider("unknown")).toBe(false)
  })
})
