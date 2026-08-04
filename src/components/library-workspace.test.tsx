// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import type * as ConvexReact from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { LibraryAsset } from "./library-workspace"
import { groupLibraryAssetsByDay, LibraryWorkspace } from "./library-workspace"

const { usePaginatedQueryMock } = vi.hoisted(() => ({
  usePaginatedQueryMock: vi.fn(),
}))

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  usePaginatedQuery: usePaginatedQueryMock,
}))

const assets: LibraryAsset[] = [
  {
    _id: "generated-1",
    category: "generated_image",
    kind: "generated_image",
    name: "generated-image.webp",
    contentType: "image/webp",
    size: 2048,
    createdAt: Date.UTC(2026, 7, 3, 16),
    url: "https://example.test/generated.webp",
    conversationId: "conversation-1",
    messageId: "message-2",
    provider: "fal",
    model: "fal-ai/flux",
  },
  {
    _id: "upload-1",
    category: "upload",
    kind: "chat_upload",
    name: "brief.pdf",
    contentType: "application/pdf",
    size: 4096,
    createdAt: Date.UTC(2026, 7, 3, 15),
    url: "https://example.test/brief.pdf",
    conversationId: "conversation-1",
    messageId: "message-1",
  },
]

beforeEach(() => {
  usePaginatedQueryMock.mockReset()
  usePaginatedQueryMock.mockReturnValue({
    loadMore: vi.fn(),
    results: assets,
    status: "Exhausted",
  })
})

afterEach(cleanup)

describe("LibraryWorkspace", () => {
  it("keeps assets from the same date in one chronological section", () => {
    const groups = groupLibraryAssetsByDay(assets)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.key).toBe("2026-08-03")
    expect(groups[0]?.assets.map((asset) => asset._id)).toEqual([
      "generated-1",
      "upload-1",
    ])
  })

  it("renders generated images and uploads with an accessible filter", () => {
    const view = render(
      <LibraryWorkspace onOpenConversation={vi.fn()} onOpenProject={vi.fn()} />
    )

    expect(view.getByRole("heading", { name: "Library" })).toBeTruthy()
    expect(view.getByText("generated-image.webp")).toBeTruthy()
    expect(view.getByText("brief.pdf")).toBeTruthy()
    expect(view.container.querySelectorAll("section")).toHaveLength(1)

    fireEvent.click(view.getByRole("tab", { name: "Generated images" }))

    expect(usePaginatedQueryMock).toHaveBeenLastCalledWith(
      expect.anything(),
      { category: "generated_image", search: undefined },
      { initialNumItems: 24 }
    )
  })
})
