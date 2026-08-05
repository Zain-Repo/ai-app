import {
  AiBrain01Icon,
  AiNetworkIcon,
  Cancel01Icon,
  Clock01Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "convex/react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import type { Id } from "../../convex/_generated/dataModel"

import { api } from "../../convex/_generated/api"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { userMessageBubbleColorOptions } from "@/lib/user-message-bubble-color"
import type { UserMessageBubbleColor } from "@/lib/user-message-bubble-color"

type Props = {
  models: Array<{ label: string; value: string }>
  onOpenChange: (open: boolean) => void
  onOpenProviders: () => void
  open: boolean
}

type Preferences = {
  defaultModel: string | null
  intelligenceLevel: "adaptive" | "quick" | "balanced" | "deep"
  language: "auto" | "en" | "fr" | "es"
  responseDetail: "concise" | "balanced" | "detailed"
  userMessageBubbleColor: UserMessageBubbleColor
}

const emptyPreferences: Preferences = {
  defaultModel: null,
  intelligenceLevel: "adaptive",
  language: "auto",
  responseDetail: "balanced",
  userMessageBubbleColor: "default",
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

export function PersonalizationCenter({
  models,
  onOpenChange,
  onOpenProviders,
  open,
}: Props) {
  const personalization = useQuery(api.memories.getPersonalization)
  const connections = useQuery(api.providerConnections.listMine)
  const saved = useQuery(api.users.getPreferences)
  const updatePreferences = useMutation(api.users.updatePreferences)
  const setMemoryEnabled = useMutation(api.memories.setEnabled)
  const setHistoryEnabled = useMutation(api.memories.setHistoryEnabled)
  const create = useMutation(api.memories.create)
  const update = useMutation(api.memories.update)
  const confirm = useMutation(api.memories.confirm)
  const setPinned = useMutation(api.memories.setPinned)
  const remove = useMutation(api.memories.remove)
  const undoRemove = useMutation(api.memories.undoRemove)
  const setProcessingProfile = useMutation(api.memories.setProcessingProfile)
  const retryProcessing = useMutation(api.memories.retryProcessing)
  const clearSavedMemory = useMutation(api.memories.clear)
  const clearHistoryMemory = useMutation(api.memories.clearHistoryMemory)
  const [preferences, setPreferences] = useState<Preferences>(emptyPreferences)
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState({ content: "", key: "" })
  const [editing, setEditing] = useState<string | null>(null)
  const [editingLegacy, setEditingLegacy] = useState<Id<"memories"> | null>(
    null
  )
  const legacyEditCancelled = useRef(false)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [clearSavedMemoryOpen, setClearSavedMemoryOpen] = useState(false)
  const [clearSavedMemoryError, setClearSavedMemoryError] = useState<
    string | null
  >(null)
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

  const legacyMemories = useMemo(
    () =>
      (personalization?.legacyMemories ?? []).filter((memory) =>
        `${memory.key} ${memory.content} ${memory.scope}`
          .toLowerCase()
          .includes(query.toLowerCase())
      ),
    [personalization?.legacyMemories, query]
  )
  const hasSavedMemories =
    (personalization?.items.length ?? 0) +
      (personalization?.legacyMemories.length ?? 0) >
    0
  const connectedProviderCount =
    connections?.filter((connection) => connection.status === "connected")
      .length ?? 0

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

  async function setSavedMemoryEnabled(enabled: boolean) {
    setBusy(true)
    try {
      await setMemoryEnabled({ enabled })
      report(enabled ? "Saved memory enabled" : "Saved memory disabled")
    } catch {
      report("Could not update saved memory")
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

  async function clearAllSavedMemories() {
    setBusy(true)
    setClearSavedMemoryError(null)
    try {
      await clearSavedMemory({})
      setClearSavedMemoryOpen(false)
      report("Saved memories cleared")
    } catch {
      setClearSavedMemoryError("Could not clear saved memories. Try again.")
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
      <DialogContent
        className="h-[min(40rem,calc(100svh-2rem))] max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-4xl"
        showCloseButton={false}
      >
        <p aria-live="polite" className="sr-only" role="status">
          {notice}
        </p>
        <Tabs
          className="grid min-h-0 grid-cols-[3.75rem_minmax(0,1fr)] gap-0 font-sans sm:grid-cols-[11rem_minmax(0,1fr)]"
          defaultValue="defaults"
          orientation="vertical"
        >
          <aside className="flex min-h-0 flex-col border-r border-border/70 bg-muted/25">
            <div className="flex items-start justify-center gap-2 border-b border-border/70 p-2 sm:justify-start sm:p-2.5">
              <DialogClose
                render={
                  <Button
                    className="shrink-0 rounded-lg"
                    size="icon-sm"
                    variant="outline"
                  />
                }
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Cancel01Icon}
                  strokeWidth={2}
                />
                <span className="sr-only">Close</span>
              </DialogClose>
              <DialogHeader className="sr-only min-w-0 sm:not-sr-only sm:flex">
                <DialogTitle className="text-sm font-medium tracking-[-0.01em]">
                  Settings
                </DialogTitle>
                <DialogDescription className="text-label leading-snug">
                  Providers, defaults, and memory.
                </DialogDescription>
              </DialogHeader>
            </div>
            <nav
              aria-label="Settings navigation"
              className="min-h-0 flex-1 overflow-y-auto p-2"
            >
              <TabsList
                aria-label="Settings sections"
                className="h-auto w-full flex-col justify-start gap-1 rounded-none bg-transparent p-0"
              >
                <TabsTrigger
                  className="h-8 w-full flex-none justify-center rounded-lg px-0 text-label sm:justify-start sm:px-2.5 data-active:bg-background data-active:shadow-xs"
                  value="defaults"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Settings02Icon}
                    strokeWidth={1.8}
                  />
                  <span className="sr-only sm:not-sr-only">General</span>
                </TabsTrigger>
                <TabsTrigger
                  className="h-8 w-full flex-none justify-center rounded-lg px-0 text-label sm:justify-start sm:px-2.5 data-active:bg-background data-active:shadow-xs"
                  value="memory"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={AiBrain01Icon}
                    strokeWidth={1.8}
                  />
                  <span className="sr-only sm:not-sr-only">Saved memory</span>
                </TabsTrigger>
                <TabsTrigger
                  className="h-8 w-full flex-none justify-center rounded-lg px-0 text-label sm:justify-start sm:px-2.5 data-active:bg-background data-active:shadow-xs"
                  value="history"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Clock01Icon}
                    strokeWidth={1.8}
                  />
                  <span className="sr-only sm:not-sr-only">History</span>
                </TabsTrigger>
                <TabsTrigger
                  className="h-8 w-full flex-none justify-center rounded-lg px-0 text-label sm:justify-start sm:px-2.5 data-active:bg-background data-active:shadow-xs"
                  value="processing"
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={AiNetworkIcon}
                    strokeWidth={1.8}
                  />
                  <span className="sr-only sm:not-sr-only">Processing</span>
                </TabsTrigger>
              </TabsList>
            </nav>
          </aside>
          <TabsContent
            className="h-full min-h-0 min-w-0 space-y-5 overflow-y-auto p-4"
            value="defaults"
          >
            <SettingsPanelHeader
              description="Manage connected providers and choose the defaults used for new conversations."
              title="General"
            />
            <section
              aria-labelledby="providers-settings-heading"
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/45 p-3"
            >
              <div className="min-w-0">
                <h2
                  className="font-heading text-sm font-medium tracking-[-0.01em]"
                  id="providers-settings-heading"
                >
                  AI providers
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {connections === undefined
                    ? "Loading provider connections"
                    : connectedProviderCount === 0
                      ? "Connect an account or API key to use its models."
                      : `${connectedProviderCount} provider${connectedProviderCount === 1 ? "" : "s"} connected`}
                </p>
              </div>
              <Button
                className="text-label"
                onClick={() => {
                  onOpenChange(false)
                  onOpenProviders()
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                Manage providers
              </Button>
            </section>
            <section aria-labelledby="defaults-heading" className="space-y-3.5">
              <h2
                className="font-heading text-sm font-medium tracking-[-0.01em]"
                id="defaults-heading"
              >
                Conversation defaults
              </h2>
              <PreferenceSelect label="Default model">
                <NativeSelect
                  className="[&_select]:text-label"
                  size="sm"
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
                  className="[&_select]:text-label"
                  size="sm"
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
                  className="[&_select]:text-label"
                  size="sm"
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
                  className="[&_select]:text-label"
                  size="sm"
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
              <fieldset
                aria-describedby="message-bubble-color-description"
                className="space-y-1.5"
                disabled={busy || saved === undefined}
              >
                <legend className="text-label font-medium">
                  Your message color
                </legend>
                <p
                  className="text-xs text-muted-foreground"
                  id="message-bubble-color-description"
                >
                  Choose the color used for messages you send.
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {userMessageBubbleColorOptions.map((option) => {
                    const selected =
                      preferences.userMessageBubbleColor === option.value
                    return (
                      <label
                        className="flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 transition-[background-color,border-color,box-shadow] has-[input:checked]:border-primary/50 has-[input:checked]:bg-primary/5 has-[input:disabled]:cursor-not-allowed has-[input:disabled]:opacity-50 has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-ring/50 has-[input:focus-visible]:ring-offset-2"
                        key={option.value}
                      >
                        <input
                          checked={selected}
                          className="peer sr-only"
                          name="user-message-bubble-color"
                          onChange={() =>
                            setPreferences((current) => ({
                              ...current,
                              userMessageBubbleColor: option.value,
                            }))
                          }
                          type="radio"
                          value={option.value}
                        />
                        <span
                          aria-hidden="true"
                          className={`size-5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20 ${option.swatchClassName}`}
                        />
                        <span className="min-w-0 flex-1 text-label">
                          {option.label}
                        </span>
                        <span
                          aria-hidden="true"
                          className="hidden text-xs font-medium text-primary peer-checked:inline"
                        >
                          Selected
                        </span>
                      </label>
                    )
                  })}
                </div>
              </fieldset>
              <Button
                className="text-label"
                disabled={busy || saved === undefined}
                onClick={() => void saveDefaults()}
                size="sm"
              >
                {busy ? <Spinner /> : null} Save defaults
              </Button>
            </section>
          </TabsContent>
          <TabsContent
            className="h-full min-h-0 min-w-0 space-y-4 overflow-y-auto p-4"
            value="memory"
          >
            <SettingsPanelHeader
              description="Review, add, edit, and remove durable details used in future conversations."
              title="Saved memory"
            />
            <section aria-labelledby="memory-heading">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-title font-semibold" id="memory-heading">
                    Memory library
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
              <div className="mt-4 flex items-center justify-between gap-6 rounded-lg border p-3">
                <div className="min-w-0">
                  <span
                    className="text-sm font-medium"
                    id="saved-memory-enabled-label"
                  >
                    Save and use memories
                  </span>
                  <p
                    className="mt-1 text-xs text-muted-foreground"
                    id="saved-memory-enabled-description"
                  >
                    Allow durable details from chats to be saved and used in
                    future responses.
                  </p>
                </div>
                <Switch
                  aria-describedby="saved-memory-enabled-description"
                  aria-labelledby="saved-memory-enabled-label"
                  checked={personalization?.savedMemoryEnabled ?? false}
                  disabled={!personalization || busy}
                  id="saved-memory-enabled"
                  onCheckedChange={(checked) =>
                    void setSavedMemoryEnabled(checked)
                  }
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <div>
                  <p className="text-sm font-medium">Clear saved memory</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Permanently delete every saved and legacy memory. Chat
                    history memory will not be affected.
                  </p>
                </div>
                <AlertDialog
                  open={clearSavedMemoryOpen}
                  onOpenChange={(nextOpen) => {
                    setClearSavedMemoryOpen(nextOpen)
                    if (nextOpen) setClearSavedMemoryError(null)
                  }}
                >
                  <AlertDialogTrigger
                    render={
                      <Button
                        disabled={!hasSavedMemories || busy}
                        type="button"
                        variant="destructive"
                      />
                    }
                  >
                    Clear all saved memories
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Clear all saved memories?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes every saved and legacy memory.
                        Chat history memory will not be affected.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {clearSavedMemoryError ? (
                      <p className="text-sm text-destructive" role="alert">
                        {clearSavedMemoryError}
                      </p>
                    ) : null}
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={busy}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        disabled={busy}
                        onClick={() => void clearAllSavedMemories()}
                        variant="destructive"
                      >
                        {busy ? <Spinner /> : null} Clear saved memories
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {!personalization?.savedMemoryEnabled ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Saved memory is off. You can still review or remove legacy
                  memories while migration is in progress.
                </p>
              ) : null}
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
                  disabled={
                    busy ||
                    !personalization?.savedMemoryEnabled ||
                    !draft.key ||
                    !draft.content
                  }
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
              {legacyMemories.length > 0 ? (
                <section
                  aria-labelledby="legacy-memories-heading"
                  className="mt-6 border-t pt-4"
                >
                  <h3
                    className="text-sm font-medium"
                    id="legacy-memories-heading"
                  >
                    Legacy memories
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    These existing memories can still affect responses during
                    the migration. Edit or delete them here.
                  </p>
                  <ul aria-label="Legacy memories" className="mt-3 space-y-2">
                    {legacyMemories.map((memory) => (
                      <li className="rounded-lg border p-3" key={memory._id}>
                        <div className="flex gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{memory.key}</p>
                            {editingLegacy === memory._id ? (
                              <Input
                                aria-label={`Edit legacy memory ${memory.key}`}
                                autoFocus
                                defaultValue={memory.content}
                                onBlur={(event) => {
                                  if (legacyEditCancelled.current) {
                                    legacyEditCancelled.current = false
                                    return
                                  }
                                  const content = event.target.value.trim()
                                  setEditingLegacy(null)
                                  if (!content) {
                                    report("Memory content cannot be empty")
                                    return
                                  }
                                  if (content === memory.content) return
                                  void update({
                                    content,
                                    memoryId: memory._id,
                                  })
                                    .then(() => report("Legacy memory updated"))
                                    .catch(() =>
                                      report("Could not update legacy memory")
                                    )
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    legacyEditCancelled.current = true
                                    setEditingLegacy(null)
                                    event.currentTarget.blur()
                                  }
                                  if (event.key === "Enter")
                                    event.currentTarget.blur()
                                }}
                              />
                            ) : (
                              <p className="mt-1 text-sm">{memory.content}</p>
                            )}
                            <p className="mt-2 text-xs text-muted-foreground">
                              {memory.scope} · Last changed{" "}
                              {formatMemoryDate(memory.updatedAt)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              aria-label={`Edit legacy memory ${memory.key}`}
                              disabled={busy}
                              onClick={() => {
                                legacyEditCancelled.current = false
                                setEditingLegacy(memory._id)
                              }}
                              size="sm"
                              variant="outline"
                            >
                              Edit
                            </Button>
                            <Button
                              aria-label={`Delete legacy memory ${memory.key}`}
                              disabled={busy}
                              onClick={() =>
                                void remove({ memoryId: memory._id })
                                  .then(() => report("Legacy memory removed"))
                                  .catch(() =>
                                    report("Could not remove legacy memory")
                                  )
                              }
                              size="sm"
                              variant="destructive"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
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
          <TabsContent
            className="h-full min-h-0 min-w-0 space-y-4 overflow-y-auto p-4"
            value="history"
          >
            <SettingsPanelHeader
              description="Control whether eligible conversations create private history summaries."
              title="History"
            />
            <section aria-labelledby="history-heading">
              <h2 className="text-title font-semibold" id="history-heading">
                Chat history memory
              </h2>
              <p className="mt-1 text-body text-muted-foreground">
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
              <p className="text-body">
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
            className="h-full min-h-0 min-w-0 space-y-4 overflow-y-auto p-4"
            value="processing"
          >
            <SettingsPanelHeader
              description="Choose the provider that extracts and indexes memory, and monitor its status."
              title="Processing"
            />
            <section aria-labelledby="processing-heading">
              <h2 className="text-title font-semibold" id="processing-heading">
                Memory processing
              </h2>
              {personalization?.processing ? (
                <div className="mt-3 rounded-lg border p-3 text-body">
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

function SettingsPanelHeader({
  description,
  title,
}: {
  description: string
  title: string
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 -mt-4 border-b border-border/70 bg-popover/95 px-4 py-3.5 backdrop-blur-sm">
      <h2 className="font-heading text-sm font-medium tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mt-1 max-w-2xl text-label leading-snug text-muted-foreground">
        {description}
      </p>
    </header>
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
    <label className="grid gap-1.5 text-label font-medium sm:grid-cols-[9rem_1fr] sm:items-center">
      <span>{label}</span>
      {children}
    </label>
  )
}
