// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type * as ConvexReact from "convex/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../../convex/_generated/dataModel"
import { RecentGenerationsCarousel } from "./recent-generations-carousel"

const {
  carouselApi,
  carouselHandlers,
  loadMoreMock,
  setSlidesInView,
  usePaginatedQueryMock,
} = vi.hoisted(() => {
  const handlers = new Map<string, () => void>()
  let slidesInView = [0, 1, 2, 3]
  const api = {
    off: vi.fn((event: string) => {
      handlers.delete(event)
      return api
    }),
    on: vi.fn((event: string, handler: () => void) => {
      handlers.set(event, handler)
      return api
    }),
    selectedScrollSnap: vi.fn(() => 0),
    slidesInView: vi.fn(() => slidesInView),
  }

  return {
    carouselApi: api,
    carouselHandlers: handlers,
    loadMoreMock: vi.fn(),
    setSlidesInView: (slides: number[]) => {
      slidesInView = slides
    },
    usePaginatedQueryMock: vi.fn(),
  }
})

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  usePaginatedQuery: usePaginatedQueryMock,
}))

vi.mock("@/components/ui/carousel", async () => {
  const React = await import("react")

  return {
    Carousel: ({
      children,
      setApi,
      ...props
    }: {
      children: ReactNode
      setApi?: (api: typeof carouselApi) => void
    }) => {
      React.useEffect(() => setApi?.(carouselApi), [setApi])
      return <div {...props}>{children}</div>
    },
    CarouselContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    CarouselItem: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    CarouselNext: () => <button type="button">Next slide</button>,
    CarouselPrevious: () => <button type="button">Previous slide</button>,
  }
})

const generatedAssets = Array.from({ length: 8 }, (_, index) => ({
  _id: `generated-${index}` as Id<"libraryAssets">,
  _creationTime: index,
  ownerId: "owner-1" as Id<"users">,
  storageId: `storage-${index}` as Id<"_storage">,
  category: "generated_image" as const,
  kind: "generated_image" as const,
  name: `generation-${index + 1}.webp`,
  contentType: "image/webp",
  size: 2048,
  createdAt: Date.UTC(2026, 7, 19, 16, index),
  url: `https://example.test/generated-${index}.webp`,
  conversationId: "conversation-1" as Id<"conversations">,
  messageId: "message-1" as Id<"messages">,
  provider: "fal",
  model: "fal-ai/flux",
}))

beforeEach(() => {
  carouselHandlers.clear()
  loadMoreMock.mockReset()
  setSlidesInView([0, 1, 2, 3])
  usePaginatedQueryMock.mockReset()
  usePaginatedQueryMock.mockReturnValue({
    loadMore: loadMoreMock,
    results: generatedAssets,
    status: "CanLoadMore",
  })
})

afterEach(cleanup)

describe("RecentGenerationsCarousel", () => {
  it("requests the authenticated generated-image feed and renders its URLs", () => {
    render(<RecentGenerationsCarousel />)

    expect(usePaginatedQueryMock).toHaveBeenCalledWith(
      expect.anything(),
      { category: "generated_image", search: undefined },
      { initialNumItems: 8 }
    )
    expect(
      screen.getByRole("img", { name: "generation-1.webp" }).getAttribute("src")
    ).toBe("https://example.test/generated-0.webp")
  })

  it("loads another bounded page when the user reaches the loaded tail", async () => {
    render(<RecentGenerationsCarousel />)

    await waitFor(() => expect(carouselHandlers.has("select")).toBe(true))
    setSlidesInView([5, 6, 7])
    carouselHandlers.get("select")?.()

    expect(loadMoreMock).toHaveBeenCalledOnce()
    expect(loadMoreMock).toHaveBeenCalledWith(8)
  })

  it("replaces a failed signed URL with a controlled fallback", () => {
    render(<RecentGenerationsCarousel />)

    fireEvent.error(screen.getByRole("img", { name: "generation-1.webp" }))

    expect(
      screen.getByRole("img", { name: "generation-1.webp is unavailable" })
    ).toBeTruthy()
  })
})
