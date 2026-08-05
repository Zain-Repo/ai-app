// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import type * as ConvexReact from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../../convex/_generated/api"
import { ArchivedChatsDialog } from "./archived-chats-dialog"

const { useQueryMock } = vi.hoisted(() => ({ useQueryMock: vi.fn() }))

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useMutation: () => vi.fn(),
  useQuery: useQueryMock,
}))

beforeEach(() => {
  useQueryMock.mockReset()
  useQueryMock.mockReturnValue({ conversations: [], isPartial: false })
})

afterEach(cleanup)

describe("ArchivedChatsDialog", () => {
  it("filters and labels archived image threads for Dev3 Image", () => {
    render(<ArchivedChatsDialog open outputMode="image" />)

    expect(useQueryMock).toHaveBeenCalledWith(
      api.conversations.listWorkspaceRecent,
      {
        limit: 30,
        outputMode: "image",
        status: "archived",
      }
    )
    expect(
      screen.getByRole("heading", { name: "Archived images" })
    ).toBeTruthy()
    expect(screen.getByText("No archived images yet.")).toBeTruthy()
  })

  it("discloses when archived workspace history is partial", () => {
    useQueryMock.mockReturnValue({ conversations: [], isPartial: true })

    render(<ArchivedChatsDialog open outputMode="image" />)

    expect(screen.getByRole("status").textContent).toMatch(
      /some older images are temporarily unavailable/i
    )
  })
})
