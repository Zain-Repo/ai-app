// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
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
