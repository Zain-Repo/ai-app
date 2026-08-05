import {
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  LibraryBig,
  Search,
} from "lucide-react"
import { useDeferredValue, useMemo, useState } from "react"
import type { FunctionReturnType } from "convex/server"
import { usePaginatedQuery } from "convex/react"
import { toast } from "sonner"

import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from "@/components/ui/attachment"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type LibraryFilter = "all" | "upload" | "generated_image"

export type LibraryAsset = FunctionReturnType<
  typeof api.library.list
>["page"][number]

type LibraryDay = {
  key: string
  date: Date
  assets: LibraryAsset[]
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "long",
  weekday: "short",
  year: "numeric",
})

function getDayKey(timestamp: number) {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

export function groupLibraryAssetsByDay(assets: LibraryAsset[]) {
  const days = new Map<string, LibraryDay>()
  for (const asset of [...assets].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = getDayKey(asset.createdAt)
    const existing = days.get(key)
    if (existing) existing.assets.push(asset)
    else
      days.set(key, { key, date: new Date(asset.createdAt), assets: [asset] })
  }
  return [...days.values()]
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = units[0]
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024
    unit = units[index]
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`
}

function getAssetMetadata(asset: LibraryAsset) {
  const type = asset.contentType.split("/").at(-1)?.toUpperCase() ?? "FILE"
  const source =
    asset.kind === "generated_image"
      ? [asset.provider, asset.model].filter(Boolean).join(" · ") ||
        "Generated image"
      : asset.kind === "project_upload"
        ? "Project source"
        : "Chat upload"
  return `${type} · ${formatFileSize(asset.size)} · ${source}`
}

function AssetPreview({ asset }: { asset: LibraryAsset }) {
  if (asset.url && asset.contentType.startsWith("image/"))
    return (
      <img
        alt={asset.name}
        className="max-h-[65vh] w-full rounded-2xl bg-muted object-contain"
        src={asset.url}
      />
    )

  return (
    <div className="grid min-h-48 place-items-center rounded-2xl bg-muted/60 p-8 text-center">
      <div>
        <FileText aria-hidden="true" className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-medium">{asset.name}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {asset.url
            ? "A preview is not available for this file type."
            : "The stored file is no longer available."}
        </p>
      </div>
    </div>
  )
}

export async function downloadLibraryAsset(url: string, name: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed with ${response.status}`)

  const objectUrl = URL.createObjectURL(await response.blob())
  try {
    const anchor = document.createElement("a")
    anchor.download = name
    anchor.href = objectUrl
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function LibraryAssetItem({
  asset,
  onOpenConversation,
  onOpenProject,
  onUseAsReference,
}: {
  asset: LibraryAsset
  onOpenConversation: (conversationId: string, messageId: string) => void
  onOpenProject: (projectId: string) => void
  onUseAsReference?: (asset: LibraryAsset) => void
}) {
  const [isDownloading, setIsDownloading] = useState(false)
  const isGenerated = asset.kind === "generated_image"
  const isImage = asset.contentType.startsWith("image/")
  const isSupportedReference = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ].includes(asset.contentType)
  const openContext = () => {
    if (asset.kind === "project_upload") onOpenProject(asset.projectId)
    else onOpenConversation(asset.conversationId, asset.messageId)
  }
  const download = async () => {
    if (!asset.url) return
    setIsDownloading(true)
    try {
      await downloadLibraryAsset(asset.url, asset.name)
    } catch {
      toast.error("Download failed", {
        description: "The file could not be downloaded. Please try again.",
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <li className={isGenerated ? "min-w-0" : "min-w-0 md:col-span-2"}>
      <Dialog>
        <Attachment
          className={
            isGenerated
              ? "w-full flex-col overflow-hidden p-0 has-data-[slot=attachment-content]:w-full has-data-[slot=attachment-content]:px-3 has-data-[slot=attachment-content]:pb-3"
              : "w-full"
          }
          orientation={isGenerated ? "vertical" : "horizontal"}
        >
          <AttachmentMedia
            className={
              isGenerated
                ? "aspect-4/3 w-full rounded-none bg-muted"
                : undefined
            }
            variant={isImage ? "image" : "icon"}
          >
            {asset.url && isImage ? (
              <img alt="" loading="lazy" src={asset.url} />
            ) : isGenerated ? (
              <ImageIcon aria-hidden="true" />
            ) : (
              <FileText aria-hidden="true" />
            )}
          </AttachmentMedia>
          <AttachmentContent className="min-w-0">
            <AttachmentTitle>{asset.name}</AttachmentTitle>
            <AttachmentDescription>
              {getAssetMetadata(asset)}
            </AttachmentDescription>
          </AttachmentContent>
          <DialogTrigger
            render={<AttachmentTrigger aria-label={`Preview ${asset.name}`} />}
          />
        </Attachment>
        <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{asset.name}</DialogTitle>
            <DialogDescription>{getAssetMetadata(asset)}</DialogDescription>
          </DialogHeader>
          <AssetPreview asset={asset} />
          <DialogFooter>
            {asset.url && isSupportedReference && onUseAsReference ? (
              <Button onClick={() => onUseAsReference(asset)} variant="outline">
                <ImagePlus aria-hidden="true" />
                Use as reference
              </Button>
            ) : null}
            <Button onClick={openContext} variant="outline">
              <ExternalLink aria-hidden="true" />
              Open original context
            </Button>
            {asset.url ? (
              <Button disabled={isDownloading} onClick={() => void download()}>
                <Download aria-hidden="true" />
                {isDownloading ? "Downloading…" : "Download"}
              </Button>
            ) : (
              <Button disabled>
                <Download aria-hidden="true" />
                Download
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  )
}

function LibraryLoading() {
  return (
    <div aria-label="Loading Library" className="grid gap-8" role="status">
      {[0, 1].map((group) => (
        <div
          className="grid gap-4 md:grid-cols-[9rem_minmax(0,1fr)]"
          key={group}
        >
          <Skeleton className="h-5 w-28" />
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-52 rounded-2xl" />
            <Skeleton className="h-14 rounded-2xl md:col-span-2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LibraryWorkspace({
  onOpenConversation,
  onOpenProject,
  onUseAsReference,
}: {
  onOpenConversation: (conversationId: string, messageId: string) => void
  onOpenProject: (projectId: string) => void
  onUseAsReference?: (asset: LibraryAsset) => void
}) {
  const [filter, setFilter] = useState<LibraryFilter>("all")
  const [search, setSearch] = useState("")
  const deferredSearch = useDeferredValue(search.trim())
  const { loadMore, results, status } = usePaginatedQuery(
    api.library.list,
    {
      category: filter === "all" ? undefined : filter,
      search: deferredSearch || undefined,
    },
    { initialNumItems: 24 }
  )
  const days = useMemo(() => groupLibraryAssetsByDay(results), [results])
  const loadingFirstPage = status === "LoadingFirstPage"

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <main className="mx-auto w-full max-w-6xl px-5 py-6 md:px-8 md:py-8">
        <header className="mb-7 flex flex-col gap-5 border-b border-border/70 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="chat-workspace-kicker">Your content</p>
            <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight">
              Library
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Files you uploaded and images generated across every model, in one
              chronological trail.
            </p>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search Library</span>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              className="pl-9"
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search filenames"
              value={search}
            />
          </label>
        </header>

        <Tabs
          onValueChange={(value) => setFilter(value as LibraryFilter)}
          value={filter}
        >
          <TabsList aria-label="Filter Library" className="mb-7">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="upload">Uploads</TabsTrigger>
            <TabsTrigger value="generated_image">Generated images</TabsTrigger>
          </TabsList>
          <TabsContent value={filter}>
            {loadingFirstPage ? (
              <LibraryLoading />
            ) : days.length ? (
              <div className="grid gap-9">
                {days.map((day) => (
                  <section
                    className="grid gap-4 border-t border-border/70 pt-5 first:border-t-0 first:pt-0 md:grid-cols-[9rem_minmax(0,1fr)] md:gap-6"
                    key={day.key}
                  >
                    <h2 className="text-sm font-medium text-foreground md:sticky md:top-5 md:self-start">
                      <time dateTime={day.key}>
                        {dayFormatter.format(day.date)}
                      </time>
                    </h2>
                    <ol className="grid min-w-0 gap-3 md:grid-cols-2">
                      {day.assets.map((asset) => (
                        <LibraryAssetItem
                          asset={asset}
                          key={asset._id}
                          onOpenConversation={onOpenConversation}
                          onOpenProject={onOpenProject}
                          onUseAsReference={onUseAsReference}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
              </div>
            ) : (
              <Empty className="min-h-80 border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LibraryBig aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>
                    {deferredSearch
                      ? "No matching content"
                      : "Your Library is empty"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {deferredSearch
                      ? "Try a different filename or content filter."
                      : "Uploads and generated images will appear here automatically."}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </TabsContent>
        </Tabs>

        {status === "CanLoadMore" || status === "LoadingMore" ? (
          <div className="mt-8 flex justify-center">
            <Button
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(24)}
              variant="outline"
            >
              {status === "LoadingMore" ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </main>
    </div>
  )
}
