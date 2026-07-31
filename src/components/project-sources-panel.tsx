import {
  FileText,
  Link,
  RefreshCw,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import { useMemo, useState } from "react"

import type { Id } from "../../convex/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"

export type ProjectEmbeddingProvider = "openai" | "openrouter"

export type ProjectEmbeddingStatus =
  | "not_indexed"
  | "queued"
  | "extracting"
  | "indexing"
  | "ready"
  | "partial"
  | "failed"
  | "provider_required"
  | "needs_reauthentication"
  | "insufficient_credits"
  | "unsupported"

export type ProjectEmbeddingConnection = {
  connectionId: Id<"providerConnections">
  displayName?: string
  provider: "codex" | "cursor" | "openai" | "openrouter"
  status: "connected" | "disconnected" | "needs_reauthentication"
}

export type ProjectEmbeddingProfile = {
  providerConnectionId: Id<"providerConnections">
  model: string
  provider: ProjectEmbeddingProvider
  revision: number
}

export type ProjectSourceItem = {
  _id: Id<"projectSources">
  createdAt: number
  embeddingProfileRevision?: number
  indexErrorCode?:
    | "provider_required"
    | "needs_reauthentication"
    | "insufficient_credits"
    | "unsupported"
    | "indexing_failed"
  indexedChunkCount?: number
  indexStatus?:
    | "queued"
    | "extracting"
    | "indexing"
    | "ready"
    | "partial"
    | "failed"
    | "unsupported"
  kind: "file" | "link"
  name: string
  size?: number
  url: string | null
}

export type ProjectSourcesPanelProps = {
  actionError?: string
  actionPending?: boolean
  connections: readonly ProjectEmbeddingConnection[] | undefined
  onConnectProvider: () => void
  onPinProvider: (
    connectionId: Id<"providerConnections">
  ) => Promise<void> | void
  onRemoveSource: (sourceId: Id<"projectSources">) => Promise<void> | void
  onRetryIndexing: (sourceId?: Id<"projectSources">) => Promise<void> | void
  profile: ProjectEmbeddingProfile | null | undefined
  sources: ProjectSourceItem[]
}

type StatusPresentation = {
  label: string
  tone: "default" | "destructive" | "outline" | "secondary"
}

const statusPresentation: Record<ProjectEmbeddingStatus, StatusPresentation> = {
  not_indexed: { label: "Not indexed", tone: "outline" },
  queued: { label: "Queued", tone: "secondary" },
  extracting: { label: "Reading", tone: "secondary" },
  indexing: { label: "Indexing", tone: "secondary" },
  ready: { label: "Ready", tone: "default" },
  partial: { label: "Partially indexed", tone: "outline" },
  failed: { label: "Failed", tone: "destructive" },
  provider_required: { label: "Provider required", tone: "outline" },
  needs_reauthentication: {
    label: "Reconnect provider",
    tone: "destructive",
  },
  insufficient_credits: {
    label: "Credits required",
    tone: "destructive",
  },
  unsupported: { label: "Unsupported", tone: "outline" },
}

const retryableStatuses = new Set<ProjectEmbeddingStatus>([
  "failed",
  "insufficient_credits",
  "needs_reauthentication",
  "not_indexed",
  "partial",
])

export function getEmbeddingConnections(
  connections: readonly ProjectEmbeddingConnection[] | undefined
) {
  return (connections ?? []).filter(
    (
      connection
    ): connection is ProjectEmbeddingConnection & {
      provider: ProjectEmbeddingProvider
    } =>
      (connection.provider === "openai" ||
        connection.provider === "openrouter") &&
      connection.status === "connected"
  )
}

export function getProjectEmbeddingSummary(
  sources: readonly ProjectSourceItem[]
) {
  if (sources.length === 0) return "Add a source to enable semantic search."
  const searchable = sources.filter((source) => {
    const status = getProjectSourceEmbeddingStatus(source)
    return status === "ready" || status === "partial"
  }).length
  const working = sources.filter((source) =>
    ["queued", "extracting", "indexing"].includes(
      getProjectSourceEmbeddingStatus(source)
    )
  ).length
  if (working)
    return `${working} ${working === 1 ? "source is" : "sources are"} being indexed.`
  if (searchable === sources.length)
    return `${searchable} ${searchable === 1 ? "source is" : "sources are"} searchable.`
  if (searchable)
    return `${searchable} of ${sources.length} sources are searchable.`
  return "No sources are searchable yet."
}

export function isRetryableProjectEmbeddingStatus(
  status: ProjectEmbeddingStatus
) {
  return retryableStatuses.has(status)
}

export function getProjectSourceEmbeddingStatus(
  source: ProjectSourceItem
): ProjectEmbeddingStatus {
  if (source.indexErrorCode === "indexing_failed") return "failed"
  if (source.indexErrorCode) return source.indexErrorCode
  return source.indexStatus ?? "not_indexed"
}

function providerLabel(provider: ProjectEmbeddingProvider) {
  return provider === "openai" ? "OpenAI" : "OpenRouter"
}

function formatFileSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatProjectDate(value: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year:
      new Date(value).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  }).format(value)
}

export function ProjectSourcesPanel({
  actionError,
  actionPending = false,
  connections,
  onConnectProvider,
  onPinProvider,
  onRemoveSource,
  onRetryIndexing,
  profile,
  sources,
}: ProjectSourcesPanelProps) {
  const embeddingConnections = useMemo(
    () => getEmbeddingConnections(connections),
    [connections]
  )
  const [pendingConnectionId, setPendingConnectionId] = useState<
    Id<"providerConnections"> | undefined
  >()
  const [pendingRemoval, setPendingRemoval] = useState<
    ProjectSourceItem | undefined
  >()
  const selectedConnectionId = profile?.providerConnectionId
  const profileConnection = connections?.find(
    (connection) => connection.connectionId === selectedConnectionId
  )
  const profileNeedsAuthentication = Boolean(
    profile && profileConnection?.status !== "connected"
  )
  const canIndex = sources.length > 0 && embeddingConnections.length > 0
  const pendingConnection = embeddingConnections.find(
    (connection) => connection.connectionId === pendingConnectionId
  )
  const summary = getProjectEmbeddingSummary(sources)

  const chooseConnection = (value: string) => {
    const connection = embeddingConnections.find(
      (candidate) => candidate.connectionId === value
    )
    if (!connection || connection.connectionId === selectedConnectionId) return
    if (profile) {
      setPendingConnectionId(connection.connectionId)
      return
    }
    void onPinProvider(connection.connectionId)
  }

  return (
    <div className="space-y-4">
      <section
        aria-labelledby="project-search-heading"
        className="rounded-2xl bg-muted/35 p-4 ring-1 ring-border/70"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-background text-primary ring-1 ring-border/70">
              <Search aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className="text-sm font-semibold"
                  id="project-search-heading"
                >
                  Semantic search
                </h2>
                {profile ? (
                  <Badge variant="outline">
                    {providerLabel(profile.provider)} pinned
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {profileNeedsAuthentication
                  ? "Reconnect the pinned provider before indexing can continue."
                  : summary}
              </p>
            </div>
          </div>

          <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
            {embeddingConnections.length ? (
              <NativeSelect
                aria-label="Embedding provider"
                className="min-w-40 flex-1 sm:flex-none"
                disabled={actionPending || sources.length === 0}
                onChange={(event) => chooseConnection(event.target.value)}
                value={selectedConnectionId ?? ""}
              >
                <NativeSelectOption disabled value="">
                  Choose provider
                </NativeSelectOption>
                {embeddingConnections.map((connection) => (
                  <NativeSelectOption
                    key={connection.connectionId}
                    value={connection.connectionId}
                  >
                    {connection.displayName ??
                      providerLabel(connection.provider)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : null}
            {!embeddingConnections.length || profileNeedsAuthentication ? (
              <Button
                disabled={actionPending}
                onClick={onConnectProvider}
                size="sm"
                type="button"
                variant="outline"
              >
                {profileNeedsAuthentication
                  ? "Reconnect provider"
                  : "Connect OpenAI or OpenRouter"}
              </Button>
            ) : null}
          </div>
        </div>

        {!profile && canIndex ? (
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Select a provider to index these sources using your connected
            account. The provider remains pinned until you explicitly re-index.
          </p>
        ) : null}
        {profile ? (
          <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            Model {profile.model}
            {" \u00b7 "}
            index revision {profile.revision}
          </p>
        ) : null}
        {actionError ? (
          <p
            aria-live="polite"
            className="mt-3 flex items-start gap-2 text-xs text-destructive"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5" />
            {actionError}
          </p>
        ) : null}
      </section>

      {sources.length === 0 ? (
        <Empty className="min-h-44 border-0">
          <EmptyHeader>
            <EmptyTitle>No sources yet</EmptyTitle>
            <EmptyDescription>
              Add files to give every chat in this project shared context.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="divide-y" aria-label="Project sources">
          {sources.map((source) => {
            const effectiveStatus = getProjectSourceEmbeddingStatus(source)
            const status = statusPresentation[effectiveStatus]
            const isWorking = ["queued", "extracting", "indexing"].includes(
              effectiveStatus
            )
            const sourceDetails =
              source.kind === "file" && source.size !== undefined
                ? formatFileSize(source.size)
                : "Link"
            return (
              <div
                className="flex items-center gap-3 px-3 py-4"
                key={source._id}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted/50 text-muted-foreground">
                  {source.kind === "file" ? (
                    <FileText aria-hidden="true" className="size-4" />
                  ) : (
                    <Link aria-hidden="true" className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  {source.url ? (
                    <a
                      className="block truncate text-sm font-semibold hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
                      href={source.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {source.name}
                    </a>
                  ) : (
                    <span className="block truncate text-sm font-semibold">
                      {source.name}
                    </span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {sourceDetails}
                    {" \u00b7 "}
                    {formatProjectDate(source.createdAt)}
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant={status.tone}>
                    {isWorking ? <Spinner aria-hidden="true" /> : null}
                    {status.label}
                  </Badge>
                  {isRetryableProjectEmbeddingStatus(effectiveStatus) &&
                  profile ? (
                    <Button
                      aria-label={`Retry indexing ${source.name}`}
                      disabled={actionPending || profileNeedsAuthentication}
                      onClick={() => void onRetryIndexing(source._id)}
                      size="icon-xs"
                      title="Retry indexing"
                      type="button"
                      variant="ghost"
                    >
                      <RefreshCw aria-hidden="true" />
                    </Button>
                  ) : null}
                  <Button
                    aria-label={`Remove ${source.name}`}
                    disabled={actionPending}
                    onClick={() => setPendingRemoval(source)}
                    size="icon-xs"
                    title="Remove source"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingConnectionId(undefined)
        }}
        open={pendingConnectionId !== undefined}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-index project sources?</AlertDialogTitle>
            <AlertDialogDescription>
              Switching to {pendingConnection?.displayName ?? "this provider"}
              will rebuild every source in a new embedding space. Existing
              search stays unavailable until the new index is ready.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>
              Keep current provider
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingConnectionId || actionPending}
              onClick={() => {
                if (!pendingConnectionId) return
                void onPinProvider(pendingConnectionId)
                setPendingConnectionId(undefined)
              }}
            >
              Re-index sources
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(undefined)
        }}
        open={pendingRemoval !== undefined}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove project source?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRemoval?.name ?? "This source"} and its semantic index
              will be removed from this project. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionPending}>
              Keep source
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!pendingRemoval || actionPending}
              onClick={() => {
                if (!pendingRemoval) return
                void onRemoveSource(pendingRemoval._id)
                setPendingRemoval(undefined)
              }}
              variant="destructive"
            >
              Remove source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
