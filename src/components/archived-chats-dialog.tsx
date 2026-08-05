import { ArchiveRestoreIcon, Delete02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useMutation, useQuery } from "convex/react"
import { useState } from "react"
import type { ReactElement } from "react"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
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
import type { WorkspaceOutputMode } from "@/lib/workspace-product"

type ArchivedChatsDialogProps = {
  onOpenChange?: (open: boolean) => void
  onOpenChat?: (conversation: {
    projectId?: Id<"projects">
    slug: Id<"conversations">
  }) => void | Promise<void>
  open?: boolean
  outputMode: WorkspaceOutputMode
  trigger?: ReactElement
}

function getArchivedWorkspaceCopy(outputMode: WorkspaceOutputMode) {
  if (outputMode === "image")
    return {
      item: "image",
      items: "images",
      restoreTarget: "an image thread",
    }

  return {
    item: "chat",
    items: "chats",
    restoreTarget: "a chat",
  }
}

export function ArchivedChatsDialog({
  onOpenChange,
  onOpenChat,
  open: controlledOpen,
  outputMode,
  trigger,
}: ArchivedChatsDialogProps) {
  const archived = useQuery(api.conversations.listRecent, {
    limit: 30,
    outputMode,
    status: "archived",
  })
  const unarchiveConversation = useMutation(api.conversations.unarchive)
  const removeConversation = useMutation(api.conversations.remove)
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isControlled = controlledOpen !== undefined
  const open = controlledOpen ?? uncontrolledOpen
  const copy = getArchivedWorkspaceCopy(outputMode)

  function setOpen(nextOpen: boolean) {
    if (!isControlled) setUncontrolledOpen(nextOpen)
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      setPendingId(null)
      setError(null)
    }
  }

  async function restore(conversationId: Id<"conversations">) {
    setPendingId(conversationId)
    setError(null)
    try {
      await unarchiveConversation({ conversationId })
    } catch {
      setError(`Could not restore that ${copy.item}. Try again.`)
    } finally {
      setPendingId(null)
    }
  }

  async function remove(conversationId: Id<"conversations">) {
    setPendingId(conversationId)
    setError(null)
    try {
      await removeConversation({ conversationId })
    } catch {
      setError(`Could not delete that ${copy.item}. Try again.`)
    } finally {
      setPendingId(null)
    }
  }

  async function openChat(conversation: {
    _id: Id<"conversations">
    projectId?: Id<"projects">
  }) {
    setError(null)
    try {
      await onOpenChat?.({
        projectId: conversation.projectId,
        slug: conversation._id,
      })
      setOpen(false)
    } catch {
      setError(`Could not open that ${copy.item}. Try again.`)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
      }}
    >
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-4 py-3.5 pr-12 sm:px-5">
          <DialogTitle>Archived {copy.items}</DialogTitle>
          <DialogDescription>
            Restore {copy.restoreTarget} to the sidebar or delete it
            permanently.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[min(28rem,calc(100svh-9rem))] overflow-y-auto px-4 py-3.5 sm:px-5">
          {archived === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Loading archived {copy.items}
            </div>
          ) : archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No archived {copy.items} yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {archived.map((conversation) => {
                const busy = pendingId === conversation._id
                return (
                  <li
                    className="flex items-start gap-2.5 rounded-xl border border-border/70 px-3 py-2.5"
                    key={conversation._id}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      disabled={busy}
                      onClick={() => void openChat(conversation)}
                      type="button"
                    >
                      <p className="truncate text-sm font-medium">
                        {conversation.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Archived
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label={`Restore ${conversation.title}`}
                        disabled={busy}
                        onClick={() => void restore(conversation._id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        {busy ? (
                          <Spinner className="size-4" />
                        ) : (
                          <HugeiconsIcon
                            aria-hidden="true"
                            icon={ArchiveRestoreIcon}
                            strokeWidth={1.8}
                          />
                        )}
                      </Button>
                      <Button
                        aria-label={`Delete ${conversation.title}`}
                        disabled={busy}
                        onClick={() => void remove(conversation._id)}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <HugeiconsIcon
                          aria-hidden="true"
                          className="text-destructive"
                          icon={Delete02Icon}
                          strokeWidth={1.8}
                        />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {error ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
