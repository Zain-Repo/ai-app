import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  CircleArrowReload01Icon,
  Delete02Icon,
  File02Icon,
  HierarchyIcon,
  Link01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
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
import { formatProjectDate } from "@/lib/format-project-date"

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
  | "pdf_no_text"
  | "pdf_too_large"
  | "pdf_unreadable"
  | "unsupported"

export type ProjectEmbeddingConnection = {
  connectionId: Id<"providerConnections">
  displayName?: string
  provider: "codex" | "cursor" | "fal" | "openai" | "openrouter"
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
    | "pdf_no_text"
    | "pdf_too_large"
    | "pdf_unreadable"
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
  tone: "default" | "destructive" | "outline" | "secondary" | "success"
}

const statusPresentation: Record<ProjectEmbeddingStatus, StatusPresentation> = {
  not_indexed: { label: "Not indexed", tone: "outline" },
  queued: { label: "Queued", tone: "secondary" },
  extracting: { label: "Extracting text", tone: "secondary" },
  indexing: { label: "Embedding text", tone: "secondary" },
  ready: { label: "Ready", tone: "success" },
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
  pdf_no_text: { label: "No readable text", tone: "outline" },
  pdf_too_large: { label: "PDF too long", tone: "outline" },
  pdf_unreadable: { label: "Unreadable PDF", tone: "destructive" },
  unsupported: { label: "Unsupported", tone: "outline" },
}

const statusDescriptions: Partial<Record<ProjectEmbeddingStatus, string>> = {
  pdf_no_text:
    "No selectable text was found. Scanned PDFs need OCR before upload.",
  pdf_too_large: "This PDF exceeds the 250-page indexing limit.",
  pdf_unreadable:
    "This PDF could not be read. It may be damaged or password-protected.",
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

function getAttachmentState(status: ProjectEmbeddingStatus) {
  if (status === "queued" || status === "extracting" || status === "indexing")
    return "processing" as const
  if (
    status === "failed" ||
    status === "needs_reauthentication" ||
    status === "insufficient_credits" ||
    status === "pdf_unreadable"
  )
    return "error" as const
  if (status === "ready" || status === "partial") return "done" as const
  return "idle" as const
}

function SourceIndexingProgress({
  status,
}: {
  status: ProjectEmbeddingStatus
}) {
  const isWorking = ["queued", "extracting", "indexing"].includes(status)
  const extractionComplete = ["indexing", "ready", "partial"].includes(status)
  const embeddingComplete = ["ready", "partial"].includes(status)
  const extractionActive = status === "queued" || status === "extracting"
  const embeddingActive = status === "indexing"

  if (!isWorking && !extractionComplete) return null

  return (
    <div
      aria-label={
        isWorking ? "Preparing source for semantic search" : "Source pipeline"
      }
      className="grid gap-1 text-[13px] text-muted-foreground"
      role={isWorking ? "status" : undefined}
    >
      <span
        className={
          extractionComplete
            ? "flex items-center gap-1 text-foreground/75"
            : extractionActive
              ? "flex items-center gap-1 text-primary"
              : "flex items-center gap-1"
        }
      >
        {extractionComplete ? (
          <HugeiconsIcon
            aria-hidden="true"
            className="size-3"
            icon={CheckmarkCircle02Icon}
            strokeWidth={1.8}
          />
        ) : (
          <span
            aria-hidden="true"
            className={
              extractionActive
                ? "size-1.5 animate-pulse rounded-full bg-primary"
                : "size-1.5 rounded-full bg-muted-foreground/40"
            }
          />
        )}
        Extract text
      </span>
      <span
        className={
          embeddingComplete
            ? "flex items-center gap-1 text-foreground/75"
            : embeddingActive
              ? "flex items-center gap-1 text-primary"
              : "flex items-center gap-1"
        }
      >
        {embeddingComplete ? (
          <HugeiconsIcon
            aria-hidden="true"
            className="size-3"
            icon={CheckmarkCircle02Icon}
            strokeWidth={1.8}
          />
        ) : (
          <span
            aria-hidden="true"
            className={
              embeddingActive
                ? "size-1.5 animate-pulse rounded-full bg-primary"
                : "size-1.5 rounded-full bg-muted-foreground/40"
            }
          />
        )}
        Embed chunks
      </span>
    </div>
  )
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
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(
    () => new Set()
  )
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
  const selectedCount = sources.filter((source) =>
    selectedSourceIds.has(source._id)
  ).length
  const allSourcesSelected =
    sources.length > 0 && selectedCount === sources.length

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

  const toggleSourceSelection = (sourceId: string) => {
    setSelectedSourceIds((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }

  const toggleAllSources = () => {
    setSelectedSourceIds(
      allSourcesSelected
        ? new Set()
        : new Set(sources.map((source) => source._id))
    )
  }

  return (
    <div className="space-y-7">
      <section
        aria-labelledby="project-search-heading"
        className="rounded-lg border border-border/80 bg-muted/20 p-4"
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(16rem,1fr)_minmax(18rem,1.15fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-[5px] border border-border bg-background text-foreground">
              <HugeiconsIcon
                aria-hidden="true"
                className="size-[18px]"
                icon={Search01Icon}
                strokeWidth={1.8}
              />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className="text-[15px] font-semibold"
                  id="project-search-heading"
                >
                  Semantic search
                </h2>
                {profile ? (
                  <Badge
                    className="rounded-[5px] bg-background"
                    variant="outline"
                  >
                    {providerLabel(profile.provider)} pinned
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {profileNeedsAuthentication
                  ? "Reconnect the pinned provider before indexing can continue."
                  : summary}
              </p>
            </div>
          </div>

          {profile ? (
            <div className="flex min-w-0 items-center gap-3 lg:justify-center">
              <HugeiconsIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-foreground/75"
                icon={HierarchyIcon}
                strokeWidth={1.7}
              />
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">Model</p>
                <p className="mt-0.5 truncate text-sm text-foreground/70">
                  {profile.model}
                  {" · "}
                  index revision {profile.revision}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground lg:text-center">
              Select a provider to index sources using your connected account.
            </p>
          )}

          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            {embeddingConnections.length ? (
              <label className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none">
                <span className="shrink-0 text-sm text-muted-foreground">
                  Provider
                </span>
                <NativeSelect
                  aria-label="Embedding provider"
                  className="min-w-40 flex-1 lg:flex-none [&_select]:rounded-[5px] [&_select]:border-border [&_select]:bg-background"
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
              </label>
            ) : null}
            {!embeddingConnections.length || profileNeedsAuthentication ? (
              <Button
                disabled={actionPending}
                onClick={onConnectProvider}
                size="sm"
                type="button"
                variant="outline"
                className="rounded-[5px]"
              >
                {profileNeedsAuthentication
                  ? "Reconnect provider"
                  : "Connect OpenAI or OpenRouter"}
              </Button>
            ) : null}
          </div>
        </div>

        {!profile && canIndex ? (
          <p className="mt-4 border-t pt-4 text-xs text-muted-foreground">
            Select a provider to index these sources using your connected
            account. The provider remains pinned until you explicitly re-index.
          </p>
        ) : null}
        {actionError ? (
          <p
            aria-live="polite"
            className="mt-4 flex items-start gap-2 border-t pt-4 text-xs text-destructive"
          >
            <HugeiconsIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5"
              icon={Alert02Icon}
              strokeWidth={1.8}
            />
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
        <div className="overflow-hidden border-y border-border">
          <div className="overflow-x-auto">
            <table
              aria-label="Project sources"
              className="w-full min-w-[58rem] table-fixed border-collapse"
            >
              <colgroup>
                <col className="w-12" />
                <col className="w-[26%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[25%]" />
                <col className="w-[13%]" />
                <col className="w-16" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-4 py-3 font-normal">
                    <input
                      aria-label="Select all project sources"
                      checked={allSourcesSelected}
                      className="size-4 rounded-[4px] border-border accent-foreground"
                      onChange={toggleAllSources}
                      type="checkbox"
                    />
                  </th>
                  {[
                    "Source",
                    "Size",
                    "Added",
                    "Processing",
                    "Status",
                    "Actions",
                  ].map((label) => (
                    <th
                      className="px-3 py-3 text-sm font-medium text-muted-foreground"
                      key={label}
                      scope="col"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((source) => {
                  const effectiveStatus =
                    getProjectSourceEmbeddingStatus(source)
                  const status = statusPresentation[effectiveStatus]
                  const statusDescription = statusDescriptions[effectiveStatus]
                  const isWorking = [
                    "queued",
                    "extracting",
                    "indexing",
                  ].includes(effectiveStatus)
                  const attachmentState = getAttachmentState(effectiveStatus)
                  const sourceSize =
                    source.kind === "file" && source.size !== undefined
                      ? formatFileSize(source.size)
                      : "Link"
                  const sourceSelected = selectedSourceIds.has(source._id)

                  return (
                    <tr
                      aria-busy={isWorking}
                      aria-selected={sourceSelected}
                      className="border-b border-border/80 transition-colors last:border-b-0 hover:bg-muted/20 aria-selected:bg-muted/30"
                      data-slot="attachment"
                      data-state={attachmentState}
                      key={source._id}
                    >
                      <td className="px-4 py-4 align-middle">
                        <input
                          aria-label={`Select ${source.name}`}
                          checked={sourceSelected}
                          className="size-4 rounded-[4px] border-border accent-foreground"
                          onChange={() => toggleSourceSelection(source._id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-[5px] border border-border bg-background text-foreground/80">
                            <HugeiconsIcon
                              aria-hidden="true"
                              className="size-[18px]"
                              icon={
                                source.kind === "file" ? File02Icon : Link01Icon
                              }
                              strokeWidth={1.8}
                            />
                          </span>
                          <div className="min-w-0">
                            {source.url ? (
                              <a
                                className="block truncate text-[15px] font-medium text-foreground underline-offset-4 hover:underline focus-visible:rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                href={source.url}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {source.name}
                              </a>
                            ) : (
                              <span className="block truncate text-[15px] font-medium text-foreground">
                                {source.name}
                              </span>
                            )}
                            {isWorking ? (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {status.label}
                              </span>
                            ) : null}
                            {statusDescription ? (
                              <span className="mt-1 block text-xs leading-relaxed text-destructive">
                                {statusDescription}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 text-sm text-muted-foreground">
                        {sourceSize}
                      </td>
                      <td className="px-3 py-4 text-sm text-muted-foreground">
                        <time
                          dateTime={new Date(source.createdAt).toISOString()}
                        >
                          {formatProjectDate(source.createdAt)}
                        </time>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <SourceIndexingProgress status={effectiveStatus} />
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <Badge
                          className={
                            status.tone === "success"
                              ? "h-5 rounded-[5px] bg-[#edf3ec] px-2 text-[10px] font-semibold tracking-[0.08em] text-[#346538] uppercase shadow-none dark:bg-[#223127] dark:text-[#a8c9ad]"
                              : "h-5 rounded-[5px] px-2 text-[10px] font-semibold tracking-[0.08em] uppercase"
                          }
                          variant={status.tone}
                        >
                          {isWorking ? <Spinner aria-hidden="true" /> : null}
                          {status.label}
                        </Badge>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <div className="flex items-center justify-end gap-1">
                          {isRetryableProjectEmbeddingStatus(effectiveStatus) &&
                          profile ? (
                            <Button
                              aria-label={`Retry indexing ${source.name}`}
                              className="rounded-[5px]"
                              disabled={
                                actionPending || profileNeedsAuthentication
                              }
                              onClick={() => void onRetryIndexing(source._id)}
                              size="icon-xs"
                              title="Retry indexing"
                              type="button"
                              variant="ghost"
                            >
                              <HugeiconsIcon
                                aria-hidden="true"
                                icon={CircleArrowReload01Icon}
                                strokeWidth={1.8}
                              />
                            </Button>
                          ) : null}
                          <Button
                            aria-label={`Remove ${source.name}`}
                            className="rounded-[5px]"
                            disabled={actionPending}
                            onClick={() => setPendingRemoval(source)}
                            size="icon-xs"
                            title="Remove source"
                            type="button"
                            variant="ghost"
                          >
                            <HugeiconsIcon
                              aria-hidden="true"
                              icon={Delete02Icon}
                              strokeWidth={1.8}
                            />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border/80 px-0 py-3 text-[13px] text-muted-foreground">
            {selectedCount ? `${selectedCount} selected · ` : ""}
            Showing {sources.length} of {sources.length} sources
          </p>
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
