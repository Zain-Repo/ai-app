import {
  AiBrain01Icon,
  Alert02Icon,
  Delete02Icon,
  Edit02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "convex/react"
import { Component, useState } from "react"
import type { FormEvent, ReactElement, ReactNode } from "react"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"

type MemorySettingsDialogProps = {
  onOpenChange?: (open: boolean) => void
  open?: boolean
  trigger?: ReactElement
}

export function MemorySettingsDialog({
  onOpenChange,
  open: controlledOpen,
  trigger,
}: MemorySettingsDialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = controlledOpen ?? uncontrolledOpen

  function setOpen(nextOpen: boolean) {
    if (!isControlled) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4 pr-14 sm:px-6">
          <DialogTitle>Memory</DialogTitle>
          <DialogDescription>
            Control what AI Harness remembers across conversations. Recalled
            memories are sent with your prompts through the selected model and
            follow your OpenRouter/provider privacy settings.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <MemorySettingsErrorBoundary>
            <MemorySettingsContent />
          </MemorySettingsErrorBoundary>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MemorySettingsContent() {
  const settings = useQuery(api.memories.getSettings)
  const setEnabled = useMutation(api.memories.setEnabled)
  const removeMemory = useMutation(api.memories.remove)
  const updateMemory = useMutation(api.memories.update)
  const clearMemories = useMutation(api.memories.clear)
  const [pending, setPending] = useState<"clear" | "toggle" | "update" | null>(
    null
  )
  const [pendingId, setPendingId] = useState<Id<"memories"> | null>(null)
  const [editingId, setEditingId] = useState<Id<"memories"> | null>(null)
  const [draft, setDraft] = useState("")
  const [clearOpen, setClearOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle(enabled: boolean) {
    setPending("toggle")
    setError(null)
    try {
      await setEnabled({ enabled })
    } catch {
      setError("Could not update memory. Try again.")
    } finally {
      setPending(null)
    }
  }

  async function remove(memoryId: Id<"memories">) {
    setPendingId(memoryId)
    setError(null)
    try {
      await removeMemory({ memoryId })
    } catch {
      setError("Could not delete that memory. Try again.")
    } finally {
      setPendingId(null)
    }
  }

  async function save(
    event: FormEvent<HTMLFormElement>,
    memoryId: Id<"memories">
  ) {
    event.preventDefault()
    const content = draft.trim()
    if (!content) {
      setError("Memory content cannot be empty.")
      return
    }

    setPending("update")
    setPendingId(memoryId)
    setError(null)
    try {
      await updateMemory({ content, memoryId })
      setEditingId(null)
      setDraft("")
    } catch {
      setError("Could not update that memory. Try again.")
    } finally {
      setPending(null)
      setPendingId(null)
    }
  }

  function edit(memoryId: Id<"memories">, content: string) {
    setEditingId(memoryId)
    setDraft(content)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setDraft("")
    setError(null)
  }

  async function clear() {
    setPending("clear")
    setError(null)
    try {
      await clearMemories()
      setClearOpen(false)
    } catch {
      setError("Could not clear your memories. Try again.")
    } finally {
      setPending(null)
    }
  }

  if (settings === undefined) {
    return (
      <div
        aria-live="polite"
        className="flex min-h-48 items-center justify-center gap-2 px-5 py-6 text-sm text-muted-foreground sm:px-6"
      >
        <Spinner className="size-4" /> Loading memory settings
      </div>
    )
  }

  return (
    <>
      <div className="border-b border-border/70 px-5 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-6">
          <div className="min-w-0">
            <label className="text-sm font-medium" htmlFor="memory-enabled">
              Save and use memories
            </label>
            <p
              className="mt-1 text-xs leading-relaxed text-muted-foreground"
              id="memory-enabled-description"
            >
              Allow durable details from your chats to be saved and used in
              future responses.
            </p>
          </div>
          <Switch
            aria-describedby="memory-enabled-description"
            checked={settings.enabled}
            disabled={
              pending !== null || pendingId !== null || editingId !== null
            }
            id="memory-enabled"
            onCheckedChange={(checked) => void toggle(checked)}
          />
        </div>
      </div>

      <div className="max-h-[min(28rem,calc(100svh-15rem))] overflow-y-auto px-5 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium">Saved memories</h2>
          <span className="text-xs text-muted-foreground">
            {settings.memories.length}
          </span>
        </div>

        {settings.memories.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-center">
            <HugeiconsIcon
              aria-hidden="true"
              className="mx-auto size-5 text-muted-foreground"
              icon={AiBrain01Icon}
              strokeWidth={1.8}
            />
            <p className="mt-3 text-sm font-medium">
              {settings.enabled ? "No saved memories" : "Memory is off"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {settings.enabled
                ? "Durable preferences and useful context will appear here."
                : "Turn on memory to save useful details for future chats."}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {settings.memories.map((memory) => {
              const busy = pendingId === memory._id
              const editing = editingId === memory._id
              const inputId = `memory-${memory._id}-content`
              return (
                <li
                  className="rounded-2xl border border-border/70 px-3 py-3"
                  key={memory._id}
                >
                  {editing ? (
                    <form onSubmit={(event) => void save(event, memory._id)}>
                      <label className="sr-only" htmlFor={inputId}>
                        Memory content
                      </label>
                      <Textarea
                        aria-describedby={`${inputId}-count${error ? ` ${inputId}-error` : ""}`}
                        aria-invalid={error ? true : undefined}
                        autoFocus
                        disabled={pending === "update"}
                        id={inputId}
                        maxLength={500}
                        onChange={(event) => {
                          setDraft(event.target.value)
                          setError(null)
                        }}
                        value={draft}
                      />
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <div className="min-w-0 text-xs text-muted-foreground">
                          <span id={`${inputId}-count`}>
                            {draft.length}/500
                          </span>
                          {error ? (
                            <p
                              className="mt-1 text-destructive"
                              id={`${inputId}-error`}
                              role="alert"
                            >
                              {error}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            disabled={pending === "update"}
                            onClick={cancelEdit}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Cancel
                          </Button>
                          <Button
                            disabled={
                              pending === "update" ||
                              !draft.trim() ||
                              draft.trim() === memory.content
                            }
                            size="sm"
                            type="submit"
                          >
                            {pending === "update" ? (
                              <>
                                <Spinner /> Saving
                              </>
                            ) : (
                              "Save"
                            )}
                          </Button>
                        </div>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                          {memory.content}
                        </p>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {memory.scope === "project" ? "Project" : "Personal"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          aria-label={`Edit memory: ${memory.content}`}
                          disabled={
                            busy || pending !== null || editingId !== null
                          }
                          onClick={() => edit(memory._id, memory.content)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={Edit02Icon}
                            strokeWidth={1.8}
                          />
                        </Button>
                        <Button
                          aria-label={`Delete memory: ${memory.content}`}
                          disabled={
                            busy || pending !== null || editingId !== null
                          }
                          onClick={() => void remove(memory._id)}
                          size="icon-sm"
                          type="button"
                          variant="ghost"
                        >
                          {busy ? (
                            <Spinner className="size-4" />
                          ) : (
                            <HugeiconsIcon
                              aria-hidden="true"
                              className="text-destructive"
                              icon={Delete02Icon}
                              strokeWidth={1.8}
                            />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div aria-live="polite" className="mt-3 min-h-5">
          {error && editingId === null ? (
            <p
              className="inline-flex items-center gap-1.5 text-xs text-destructive"
              role="alert"
            >
              <HugeiconsIcon
                aria-hidden="true"
                className="size-4"
                icon={Alert02Icon}
                strokeWidth={2}
              />
              {error}
            </p>
          ) : null}
        </div>
      </div>

      {settings.memories.length > 0 ? (
        <div className="flex items-center justify-end border-t border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
          <AlertDialog
            open={clearOpen}
            onOpenChange={(nextOpen) => {
              setClearOpen(nextOpen)
              if (nextOpen) setError(null)
            }}
          >
            <AlertDialogTrigger
              render={
                <Button
                  disabled={
                    pending !== null || pendingId !== null || editingId !== null
                  }
                  type="button"
                  variant="destructive"
                />
              }
            >
              Clear all memories
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogMedia className="bg-destructive/10 text-destructive">
                  <HugeiconsIcon
                    aria-hidden="true"
                    icon={Delete02Icon}
                    strokeWidth={1.8}
                  />
                </AlertDialogMedia>
                <AlertDialogTitle>Clear all memories?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes every saved memory. Your chat history
                  will not be affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {error && clearOpen ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending === "clear"}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  disabled={pending === "clear"}
                  onClick={() => void clear()}
                  variant="destructive"
                >
                  {pending === "clear" ? (
                    <>
                      <Spinner /> Clearing
                    </>
                  ) : (
                    "Clear memories"
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ) : null}
    </>
  )
}

class MemorySettingsErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <div
        className="flex min-h-48 flex-col items-center justify-center px-5 py-6 text-center sm:px-6"
        role="alert"
      >
        <HugeiconsIcon
          aria-hidden="true"
          className="size-5 text-destructive"
          icon={Alert02Icon}
          strokeWidth={2}
        />
        <p className="mt-3 text-sm font-medium">Could not load memories</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Close this window and try again.
        </p>
      </div>
    )
  }
}
