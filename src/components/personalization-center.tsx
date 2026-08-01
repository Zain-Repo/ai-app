import { useMutation, useQuery } from "convex/react"
import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { Id } from "../../convex/_generated/dataModel"

import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Props = {
  models: Array<{ label: string; value: string }>
  onOpenChange: (open: boolean) => void
  open: boolean
}

type Preferences = {
  defaultModel: string | null
  intelligenceLevel: "adaptive" | "quick" | "balanced" | "deep"
  language: "auto" | "en" | "fr" | "es"
  responseDetail: "concise" | "balanced" | "detailed"
}

const emptyPreferences: Preferences = {
  defaultModel: null,
  intelligenceLevel: "adaptive",
  language: "auto",
  responseDetail: "balanced",
}

type MemoryProvenance = {
  expiresAt?: number
  lastUsedAt?: number
  projectName?: string
  sourceConversationTitle?: string
  sourceTimestamp: number
  status: "active" | "archived" | "candidate" | "needs_review" | "removed"
}

function formatMemoryDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(timestamp))
}

function getMemoryLifecycleLabels(item: MemoryProvenance, now = Date.now()) {
  const labels: string[] = []
  if (item.status === "needs_review") labels.push("Review needed")
  if (item.status === "candidate") labels.push("Awaiting confirmation")
  if (item.status === "archived") labels.push("Archived")
  if (item.status === "removed") labels.push("Removed")
  if (item.expiresAt)
    labels.push(
      item.expiresAt <= now
        ? `Expired ${formatMemoryDate(item.expiresAt)}`
        : `Expires ${formatMemoryDate(item.expiresAt)}`
    )
  return labels
}

function getMemoryProvenance(item: MemoryProvenance) {
  const labels = [`Saved ${formatMemoryDate(item.sourceTimestamp)}`]
  if (item.projectName) labels.push(`Project: ${item.projectName}`)
  if (item.sourceConversationTitle)
    labels.push(`From: ${item.sourceConversationTitle}`)
  if (item.lastUsedAt)
    labels.push(`Last used ${formatMemoryDate(item.lastUsedAt)}`)
  labels.push(...getMemoryLifecycleLabels(item))
  return labels
}

export function PersonalizationCenter({ models, onOpenChange, open }: Props) {
  const personalization = useQuery(api.memories.getPersonalization)
  const connections = useQuery(api.providerConnections.listMine)
  const saved = useQuery(api.users.getPreferences)
  const updatePreferences = useMutation(api.users.updatePreferences)
  const setHistoryEnabled = useMutation(api.memories.setHistoryEnabled)
  const create = useMutation(api.memories.create)
  const update = useMutation(api.memories.update)
  const confirm = useMutation(api.memories.confirm)
  const setPinned = useMutation(api.memories.setPinned)
  const remove = useMutation(api.memories.remove)
  const undoRemove = useMutation(api.memories.undoRemove)
  const setProcessingProfile = useMutation(api.memories.setProcessingProfile)
  const retryProcessing = useMutation(api.memories.retryProcessing)
  const clearHistoryMemory = useMutation(api.memories.clearHistoryMemory)
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState({ content: "", key: "" })
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [removedId, setRemovedId] = useState<Id<"memoryItems"> | null>(null)
  const [sensitiveConsent, setSensitiveConsent] = useState(false)

  useEffect(() => {
    if (open && saved) setPreferences(saved)
  }, [open, saved])

  const items = useMemo(
    () =>
      (personalization?.items ?? []).filter((item) =>
        `${item.canonicalKey} ${item.content} ${item.category}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [personalization?.items, query]
  )

  function report(text: string) {
    setNotice(text)
    window.setTimeout(() => setNotice(""), 4_000)
  }

  async function saveDefaults() {
    setBusy(true)
    try {
      await updatePreferences(preferences)
      report("Defaults saved")
    } catch {
      report("Could not save defaults")
    } finally {
      setBusy(false)
    }
  }

  async function addMemory() {
    setBusy(true)
    try {
      await create({
        canonicalKey: draft.key,
        category: "fact",
        content: draft.content,
        confirmSensitive: sensitiveConsent,
        scope: "user",
      })
      setDraft({ content: "", key: "" })
      setSensitiveConsent(false)
      report("Memory saved")
    } catch {
      report("Could not save memory")
    } finally {
      setBusy(false)
    }
  }

  async function setHistoryMemoryEnabled(enabled: boolean) {
    setBusy(true)
    try {
      await setHistoryEnabled({ enabled })
      report(enabled ? "History memory enabled" : "History memory disabled")
    } catch {
      report("Could not update history memory")
    } finally {
      setBusy(false)
    }
  }

  async function retryFailedJobs() {
    setBusy(true)
    try {
      await retryProcessing({})
      report("Failed jobs queued for retry")
    } catch {
      report("Could not retry failed jobs")
    } finally {
      setBusy(false)
    }
  }

  async function clearHistory() {
    if (
      !window.confirm(
        "Clear all chat-history memory? This does not remove your saved memories."
      )
    )
      return
    setBusy(true)
    try {
      await clearHistoryMemory({})
      report("Chat-history memory cleared")
    } catch {
      report("Could not clear chat-history memory")
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next && saved) setPreferences(saved)
      }}
    >
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4 pr-14 sm:px-6">
          <DialogTitle>Personalization</DialogTitle>
          <DialogDescription>
            Control defaults, saved memory, history, and memory processing.
          </DialogDescription>
        </DialogHeader>
        <p aria-live="polite" className="sr-only" role="status">
          {notice}
        </p>
        <Tabs className="gap-0" defaultValue="defaults">
          <TabsList
            aria-label="Personalization sections"
            className="mx-5 mt-4 w-auto sm:mx-6"
          >
            <TabsTrigger value="defaults">Defaults</TabsTrigger>
            <TabsTrigger value="memory">Saved memory</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
            <TabsTrigger value="processing">Processing</TabsTrigger>
          </TabsList>
          <TabsContent className="px-5 py-5 sm:px-6" value="defaults">
            <section aria-labelledby="defaults-heading" className="space-y-4">
              <h2 className="text-base font-medium" id="defaults-heading">
                Conversation defaults
              </h2>
              <PreferenceSelect label="Default model">
                <NativeSelect
                  value={preferences.defaultModel ?? ""}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      defaultModel: event.target.value || null,
                    }))
                  }
                >
                  <NativeSelectOption value="">
                    First available
                  </NativeSelectOption>
                  {models.map((model) => (
                    <NativeSelectOption key={model.value} value={model.value}>
                      {model.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </PreferenceSelect>
              <PreferenceSelect label="Language">
                <NativeSelect
                  value={preferences.language}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      language: event.target.value as Preferences["language"],
                    }))
                  }
                >
                  <NativeSelectOption value="auto">
                    Automatic
                  </NativeSelectOption>
                  <NativeSelectOption value="en">English</NativeSelectOption>
                  <NativeSelectOption value="fr">French</NativeSelectOption>
                  <NativeSelectOption value="es">Spanish</NativeSelectOption>
                </NativeSelect>
              </PreferenceSelect>
              <PreferenceSelect label="Reasoning">
                <NativeSelect
                  value={preferences.intelligenceLevel}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      intelligenceLevel: event.target
                        .value as Preferences["intelligenceLevel"],
                    }))
                  }
                >
                  <NativeSelectOption value="adaptive">
                    Adaptive
                  </NativeSelectOption>
                  <NativeSelectOption value="quick">Quick</NativeSelectOption>
                  <NativeSelectOption value="balanced">
                    Balanced
                  </NativeSelectOption>
                  <NativeSelectOption value="deep">Deep</NativeSelectOption>
                </NativeSelect>
              </PreferenceSelect>
              <PreferenceSelect label="Response detail">
                <NativeSelect
                  value={preferences.responseDetail}
                  onChange={(event) =>
                    setPreferences((current) => ({
                      ...current,
                      responseDetail: event.target
                        .value as Preferences["responseDetail"],
                    }))
                  }
                >
                  <NativeSelectOption value="concise">
                    Concise
                  </NativeSelectOption>
                  <NativeSelectOption value="balanced">
                    Balanced
                  </NativeSelectOption>
                  <NativeSelectOption value="detailed">
                    Detailed
                  </NativeSelectOption>
                </NativeSelect>
              </PreferenceSelect>
              <Button
                disabled={busy || saved === undefined}
                onClick={() => void saveDefaults()}
              >
                {busy ? <Spinner /> : null} Save defaults
              </Button>
            </section>
          </TabsContent>
          <TabsContent className="space-y-4 px-5 py-5 sm:px-6" value="memory">
            <section aria-labelledby="memory-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-medium" id="memory-heading">
                    Saved memory
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {personalization
                      ? `${personalization.capacity.active} of ${personalization.capacity.limit} active memories`
                      : "Loading memories"}
                  </p>
                </div>
                <Input
                  aria-label="Search saved memory"
                  className="w-52"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                  value={query}
                />
              </div>
              <div className="mt-4 grid gap-2 rounded-lg border p-3 sm:grid-cols-[1fr_2fr_auto]">
                <Input
                  aria-label="Memory key"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      key: event.target.value,
                    }))
                  }
                  placeholder="preference.style"
                  value={draft.key}
                />
                <Input
                  aria-label="Memory content"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      content: event.target.value,
                    }))
                  }
                  placeholder="A durable preference or fact"
                  value={draft.content}
                />
                <label className="col-span-full flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    checked={sensitiveConsent}
                    onChange={(event) =>
                      setSensitiveConsent(event.target.checked)
                    }
                    type="checkbox"
                  />
                  I explicitly want to save this if it contains sensitive
                  personal information.
                </label>
                <Button
                  disabled={busy || !draft.key || !draft.content}
                  onClick={() => void addMemory()}
                >
                  Add
                </Button>
              </div>
              <ul aria-label="Saved memories" className="mt-4 space-y-2">
                {items.map((item) => (
                  <li className="rounded-lg border p-3" key={item._id}>
                    <div className="flex gap-3">
                      <div className="min-w-0 flex-1">
                        {editing === item._id ? (
                          <Input
                            aria-label={`Edit ${item.canonicalKey}`}
                            defaultValue={item.content}
                            onBlur={(event) => {
                              void update({
                                content: event.target.value,
                                memoryItemId: item._id,
                              })
                                .then(() => {
                                  setEditing(null)
                                  report("Memory updated")
                                })
                                .catch(() => report("Could not update memory"))
                            }}
                            autoFocus
                          />
                        ) : (
                          <>
                            <p className="font-medium">{item.canonicalKey}</p>
                            <p className="mt-1 text-sm">{item.content}</p>
                          </>
                        )}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {item.category.replace("_", " ")} · {item.scope} ·{" "}
                          {item.confirmation} · {item.sourceSignal}
                          {item.pinned ? " · pinned" : ""}
                        </p>
                        <p
                          aria-label={`Memory provenance for ${item.canonicalKey}`}
                          className="mt-1 text-xs text-muted-foreground"
                        >
                          {getMemoryProvenance(item).join(" · ")}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditing(item._id)}
                        >
                          Edit
                        </Button>
                        {item.confirmation === "pending" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const confirmSensitive =
                                item.sensitivity === "sensitive"
                                  ? window.confirm(
                                      "This is sensitive personal information. Confirm that you want to save it?"
                                    )
                                  : false
                              if (
                                item.sensitivity === "sensitive" &&
                                !confirmSensitive
                              )
                                return
                              void confirm({
                                memoryItemId: item._id,
                                confirmSensitive,
                              })
                                .then(() => report("Memory confirmed"))
                                .catch(() => report("Could not confirm memory"))
                            }}
                          >
                            Confirm
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void setPinned({
                              memoryItemId: item._id,
                              pinned: !item.pinned,
                            })
                          }
                        >
                          {item.pinned ? "Unpin" : "Pin"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() =>
                            void remove({ memoryItemId: item._id })
                              .then(() => {
                                setRemovedId(item._id)
                                report("Memory removed")
                              })
                              .catch(() => report("Could not remove memory"))
                          }
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {removedId ? (
                <Button
                  className="mt-3"
                  onClick={() =>
                    void undoRemove({ memoryItemId: removedId })
                      .then(() => {
                        setRemovedId(null)
                        report("Memory restored")
                      })
                      .catch(() => report("Could not restore memory"))
                  }
                  size="sm"
                  variant="outline"
                >
                  Undo removal
                </Button>
              ) : null}
            </section>
          </TabsContent>
          <TabsContent className="space-y-4 px-5 py-5 sm:px-6" value="history">
            <section aria-labelledby="history-heading">
              <h2 className="text-base font-medium" id="history-heading">
                Chat history memory
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                History summaries are separate from saved memory and only
                created after you enable this setting.
              </p>
              <label className="mt-4 flex items-center gap-3 rounded-lg border p-3">
                <input
                  checked={personalization?.historyEnabled ?? false}
                  disabled={!personalization}
                  onChange={(event) =>
                    void setHistoryMemoryEnabled(event.target.checked)
                  }
                  type="checkbox"
                />
                <span>
                  <span className="block font-medium">Use chat history</span>
                  <span className="text-xs text-muted-foreground">
                    New eligible chats are processed in the background.
                  </span>
                </span>
              </label>
              <p className="text-sm">
                {personalization
                  ? `${personalization.pendingJobs} pending jobs, ${personalization.failedJobs} failed jobs.`
                  : "Loading history status"}
              </p>
              <Button
                disabled={busy}
                onClick={() => void clearHistory()}
                variant="destructive"
              >
                {busy ? <Spinner /> : null} Clear history memory
              </Button>
            </section>
          </TabsContent>
          <TabsContent
            className="space-y-4 px-5 py-5 sm:px-6"
            value="processing"
          >
            <section aria-labelledby="processing-heading">
              <h2 className="text-base font-medium" id="processing-heading">
                Memory processing
              </h2>
              {personalization?.processing ? (
                <div className="mt-3 rounded-lg border p-3 text-sm">
                  <p>
                    <strong>
                      {personalization.processing.provider === "openai"
                        ? "OpenAI"
                        : "OpenRouter"}
                    </strong>{" "}
                    · {personalization.processing.status}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    Extraction: {personalization.processing.extractionModel}.
                    Embeddings: {personalization.processing.embeddingModel} (
                    {personalization.processing.dimensions} dimensions).
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No processing provider is configured.
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                Your selected provider and its user-owned credential pay for
                memory extraction and embeddings. If it disconnects, automatic
                capture and semantic retrieval pause; confirmed saved memory
                remains available.
              </p>
              {personalization && personalization.failedJobs > 0 ? (
                <Button
                  disabled={busy}
                  onClick={() => void retryFailedJobs()}
                  variant="outline"
                >
                  {busy ? <Spinner /> : null} Retry failed jobs
                </Button>
              ) : null}
              <label className="grid gap-2 text-sm font-medium">
                Processing provider
                <NativeSelect
                  aria-label="Memory processing provider"
                  onChange={(event) =>
                    void setProcessingProfile({
                      providerConnectionId: event.target
                        .value as Id<"providerConnections">,
                    })
                      .then(() => report("Processing provider updated"))
                      .catch(() =>
                        report("Could not update processing provider")
                      )
                  }
                  value={
                    personalization?.processing?.providerConnectionId ?? ""
                  }
                >
                  <NativeSelectOption value="">
                    Choose a provider
                  </NativeSelectOption>
                  {(connections ?? [])
                    .filter(
                      (connection) =>
                        connection.status === "connected" &&
                        ((connection.provider === "openai" &&
                          connection.authMethod === "api_key") ||
                          (connection.provider === "openrouter" &&
                            connection.authMethod === "oauth"))
                    )
                    .map((connection) => (
                      <NativeSelectOption
                        key={connection.connectionId}
                        value={connection.connectionId}
                      >
                        {connection.provider === "openai"
                          ? "OpenAI API key"
                          : "OpenRouter OAuth"}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </label>
              {personalization?.degradedReason ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  Status: {personalization.degradedReason.replaceAll("_", " ")}
                </p>
              ) : null}
            </section>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function PreferenceSelect({
  children,
  label,
}: {
  children: ReactNode
  label: string
}) {
  return (
    <label className="grid gap-2 text-sm font-medium sm:grid-cols-[11rem_1fr] sm:items-center">
      <span>{label}</span>
      {children}
    </label>
  )
}
