// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import type * as ConvexReact from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../convex/_generated/dataModel"
import type { LibraryAsset } from "./library-workspace"
import {
  downloadLibraryAsset,
  groupLibraryAssetsByDay,
  LibraryWorkspace,
} from "./library-workspace"

const { usePaginatedQueryMock } = vi.hoisted(() => ({
  usePaginatedQueryMock: vi.fn(),
}))

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  usePaginatedQuery: usePaginatedQueryMock,
}))

const assets: LibraryAsset[] = [
  {
    _id: "generated-1" as Id<"libraryAssets">,
    _creationTime: 1,
    ownerId: "owner-1" as Id<"users">,
    storageId: "storage-1" as Id<"_storage">,
    category: "generated_image",
    kind: "generated_image",
    name: "generated-image.webp",
    contentType: "image/webp",
    size: 2048,
    createdAt: Date.UTC(2026, 7, 3, 16),
    url: "https://example.test/generated.webp",
    conversationId: "conversation-1" as Id<"conversations">,
    messageId: "message-2" as Id<"messages">,
    provider: "fal",
    model: "fal-ai/flux",
  },
  {
    _id: "upload-1" as Id<"libraryAssets">,
    _creationTime: 2,
    ownerId: "owner-1" as Id<"users">,
    storageId: "storage-2" as Id<"_storage">,
    category: "upload",
    kind: "chat_upload",
    name: "brief.pdf",
    contentType: "application/pdf",
    size: 4096,
    createdAt: Date.UTC(2026, 7, 3, 15),
    url: "https://example.test/brief.pdf",
    conversationId: "conversation-1" as Id<"conversations">,
    messageId: "message-1" as Id<"messages">,
  },
]

beforeEach(() => {
  usePaginatedQueryMock.mockReset()
  usePaginatedQueryMock.mockReturnValue({
    loadMore: vi.fn(),
    results: assets,
    status: "Exhausted",
  })
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:library-download"),
  })
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

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

  it("downloads signed URLs through a local blob URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("file"))
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {})
    vi.stubGlobal("fetch", fetchMock)

    await downloadLibraryAsset("https://example.test/signed-file", "brief.pdf")

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/signed-file")
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:library-download")
  })
})
