// @vitest-environment jsdom

import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../convex/_generated/dataModel"
import {
  getEmbeddingConnections,
  getProjectEmbeddingSummary,
  getProjectSourceEmbeddingStatus,
  isRetryableProjectEmbeddingStatus,
  ProjectSourcesPanel,
} from "./project-sources-panel"
import type {
  ProjectEmbeddingConnection,
  ProjectSourceItem,
} from "./project-sources-panel"

afterEach(cleanup)

const connections: ProjectEmbeddingConnection[] = [
  {
    connectionId: "codex" as Id<"providerConnections">,
    provider: "codex",
    status: "connected",
  },
  {
    connectionId: "cursor" as Id<"providerConnections">,
    provider: "cursor",
    status: "connected",
  },
  {
    connectionId: "openai" as Id<"providerConnections">,
    displayName: "Work OpenAI",
    provider: "openai",
    status: "connected",
  },
  {
    connectionId: "openrouter" as Id<"providerConnections">,
    provider: "openrouter",
    status: "needs_reauthentication",
  },
]

const source: ProjectSourceItem = {
  _id: "source" as Id<"projectSources">,
  createdAt: new Date("2026-07-31T12:00:00Z").getTime(),
  indexStatus: "failed",
  kind: "file",
  name: "brief.md",
  size: 1024,
  url: null,
}

const openAiConnection: ProjectEmbeddingConnection = {
  connectionId: "openai" as Id<"providerConnections">,
  displayName: "Work OpenAI",
  provider: "openai",
  status: "connected",
}

describe("project source embeddings", () => {
  it("only offers connected OpenAI and OpenRouter credentials", () => {
    expect(getEmbeddingConnections(connections)).toEqual([connections[2]])
  })

  it("summarizes durable source states", () => {
    expect(getProjectEmbeddingSummary([])).toBe(
      "Add a source to enable semantic search."
    )
    expect(
      getProjectEmbeddingSummary([
        { ...source, indexStatus: "ready" },
        {
          ...source,
          _id: "other" as Id<"projectSources">,
          indexStatus: "indexing",
        },
      ])
    ).toBe("1 source is being indexed.")
    expect(
      getProjectEmbeddingSummary([
        { ...source, indexStatus: "ready" },
        {
          ...source,
          _id: "other" as Id<"projectSources">,
          indexStatus: "failed",
        },
      ])
    ).toBe("1 of 2 sources are searchable.")
    expect(
      getProjectEmbeddingSummary([{ ...source, indexStatus: "partial" }])
    ).toBe("1 source is searchable.")
    expect(
      getProjectEmbeddingSummary([
        { ...source, indexStatus: "partial" },
        {
          ...source,
          _id: "other" as Id<"projectSources">,
          indexStatus: "failed",
        },
      ])
    ).toBe("1 of 2 sources are searchable.")
    expect(getProjectEmbeddingSummary([source])).toBe(
      "No sources are searchable yet."
    )
  })

  it("renders failure state and retries only the affected source", () => {
    const retry = vi.fn()
    const view = render(
      <ProjectSourcesPanel
        connections={connections}
        onConnectProvider={vi.fn()}
        onPinProvider={vi.fn()}
        onRemoveSource={vi.fn()}
        onRetryIndexing={retry}
        profile={{
          providerConnectionId: "openai" as Id<"providerConnections">,
          model: "text-embedding-3-small",
          provider: "openai",
          revision: 1,
        }}
        sources={[source]}
      />
    )

    expect(view.getByText("Failed")).toBeTruthy()
    expect(view.getByText("OpenAI pinned")).toBeTruthy()
    expect(view.container.textContent).toContain(" · ")
    expect(view.container.textContent).not.toContain("Â")
    fireEvent.click(
      view.getByRole("button", { name: "Retry indexing brief.md" })
    )
    expect(retry).toHaveBeenCalledWith(source._id)
  })

  it("explains PDFs that need OCR instead of calling them unsupported", () => {
    const view = render(
      <ProjectSourcesPanel
        connections={connections}
        onConnectProvider={vi.fn()}
        onPinProvider={vi.fn()}
        onRemoveSource={vi.fn()}
        onRetryIndexing={vi.fn()}
        profile={null}
        sources={[
          {
            ...source,
            indexErrorCode: "pdf_no_text",
            indexStatus: "unsupported",
            name: "scan.pdf",
          },
        ]}
      />
    )

    expect(view.getByText("No readable text")).toBeTruthy()
    expect(
      view.getByText(
        "No selectable text was found. Scanned PDFs need OCR before upload."
      )
    ).toBeTruthy()
    expect(view.queryByText("Unsupported")).toBeNull()
  })

  it("requires an explicit confirmation before switching providers", () => {
    const pinProvider = vi.fn()
    const eligibleConnections: ProjectEmbeddingConnection[] = [
      openAiConnection,
      {
        connectionId: "openrouter" as Id<"providerConnections">,
        provider: "openrouter",
        status: "connected",
      },
    ]
    const view = render(
      <ProjectSourcesPanel
        connections={eligibleConnections}
        onConnectProvider={vi.fn()}
        onPinProvider={pinProvider}
        onRemoveSource={vi.fn()}
        onRetryIndexing={vi.fn()}
        profile={{
          providerConnectionId: "openai" as Id<"providerConnections">,
          model: "text-embedding-3-small",
          provider: "openai",
          revision: 1,
        }}
        sources={[{ ...source, indexStatus: "ready" }]}
      />
    )

    fireEvent.change(view.getByLabelText("Embedding provider"), {
      target: { value: "openrouter" },
    })
    expect(pinProvider).not.toHaveBeenCalled()
    expect(view.getByText("Re-index project sources?")).toBeTruthy()
    fireEvent.click(view.getByRole("button", { name: "Re-index sources" }))
    expect(pinProvider).toHaveBeenCalledWith("openrouter")
  })

  it("recognizes only actionable retry states", () => {
    expect(isRetryableProjectEmbeddingStatus("not_indexed")).toBe(true)
    expect(isRetryableProjectEmbeddingStatus("insufficient_credits")).toBe(true)
    expect(isRetryableProjectEmbeddingStatus("needs_reauthentication")).toBe(
      true
    )
    expect(isRetryableProjectEmbeddingStatus("unsupported")).toBe(false)
    expect(isRetryableProjectEmbeddingStatus("indexing")).toBe(false)
    expect(
      getProjectSourceEmbeddingStatus({
        ...source,
        indexErrorCode: "needs_reauthentication",
        indexStatus: "failed",
      })
    ).toBe("needs_reauthentication")
  })

  it.each(["needs_reauthentication", "disconnected"] as const)(
    "enables retry after the pinned provider reconnects from %s",
    (status) => {
      const retry = vi.fn()
      const unavailableOpenAi: ProjectEmbeddingConnection = {
        ...openAiConnection,
        status,
      }
      const reauthenticationSource: ProjectSourceItem = {
        ...source,
        indexErrorCode: "needs_reauthentication",
      }
      const props = {
        onConnectProvider: vi.fn(),
        onPinProvider: vi.fn(),
        onRemoveSource: vi.fn(),
        onRetryIndexing: retry,
        profile: {
          providerConnectionId: openAiConnection.connectionId,
          model: "text-embedding-3-small",
          provider: "openai" as const,
          revision: 1,
        },
        sources: [reauthenticationSource],
      }
      const view = render(
        <ProjectSourcesPanel {...props} connections={[unavailableOpenAi]} />
      )
      const retryButton = view.getByRole("button", {
        name: "Retry indexing brief.md",
      })

      expect(retryButton).toHaveProperty("disabled", true)
      view.rerender(
        <ProjectSourcesPanel {...props} connections={[openAiConnection]} />
      )
      fireEvent.click(
        view.getByRole("button", { name: "Retry indexing brief.md" })
      )
      expect(retry).toHaveBeenCalledWith(source._id)
    }
  )

  it("requires confirmation before removing a source", () => {
    const removeSource = vi.fn()
    const view = render(
      <ProjectSourcesPanel
        connections={connections}
        onConnectProvider={vi.fn()}
        onPinProvider={vi.fn()}
        onRemoveSource={removeSource}
        onRetryIndexing={vi.fn()}
        profile={{
          providerConnectionId: "openai" as Id<"providerConnections">,
          model: "text-embedding-3-small",
          provider: "openai",
          revision: 1,
        }}
        sources={[source]}
      />
    )

    fireEvent.click(view.getByRole("button", { name: "Remove brief.md" }))
    expect(removeSource).not.toHaveBeenCalled()
    expect(view.getByText("Remove project source?")).toBeTruthy()

    fireEvent.click(view.getByRole("button", { name: "Remove source" }))
    expect(removeSource).toHaveBeenCalledWith(source._id)
  })
})
