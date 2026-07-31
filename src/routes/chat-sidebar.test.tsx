// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  getConnectedProviderOptions,
  getExecutionProviderOptions,
  getPreferredProvider,
  isActiveProvider,
  ProjectConversationDisclosure,
  toggleExpandedProject,
} from "./chat.{-$slug}"

beforeEach(() => {
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
