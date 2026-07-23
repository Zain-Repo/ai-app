import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  SystemUpdate02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { DesktopUpdaterState } from "../../electron/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"

const OPEN_APP_UPDATES_EVENT = "ai-harness:open-app-updates"
const UPDATE_TOAST_ID = "desktop-updater"

type UpdaterAction = "check" | "download" | "install" | null

type UpdaterPresentation = {
  action: UpdaterAction
  actionLabel: string | null
  description: string
  label: string
  title: string
}

export function openDesktopUpdaterDialog() {
  window.dispatchEvent(new Event(OPEN_APP_UPDATES_EVENT))
}

export function getDesktopUpdaterPresentation(
  state: DesktopUpdaterState | null
): UpdaterPresentation {
  if (!state)
    return {
      action: null,
      actionLabel: null,
      description: "Reading the desktop updater status.",
      label: "Loading",
      title: "Loading update status",
    }
  if (state.status === "checking")
    return {
      action: null,
      actionLabel: null,
      description: "AI Harness is checking the release feed.",
      label: "Checking",
      title: "Checking for updates",
    }
  if (state.status === "up-to-date")
    return {
      action: "check",
      actionLabel: "Check again",
      description: `Version ${state.currentVersion} is the newest available release.`,
      label: "Up to date",
      title: "AI Harness is up to date",
    }
  if (state.status === "update-available")
    return {
      action: "download",
      actionLabel: "Download update",
      description: `Version ${state.availableVersion ?? "a newer release"} can be downloaded in the background.`,
      label: "Available",
      title: "An update is available",
    }
  if (state.status === "downloading")
    return {
      action: null,
      actionLabel: null,
      description: "You can close this dialog while the download continues.",
      label: "Downloading",
      title: `Downloading ${state.availableVersion ?? "the update"}`,
    }
  if (state.status === "ready-to-install")
    return {
      action: "install",
      actionLabel: "Restart and install",
      description:
        "AI Harness will close, install the downloaded update, and reopen automatically.",
      label: "Ready",
      title: "Ready to restart",
    }
  if (state.status === "installing")
    return {
      action: null,
      actionLabel: null,
      description: "The app will reopen after the installer finishes.",
      label: "Installing",
      title: "Restarting AI Harness",
    }
  if (state.status === "disabled")
    return {
      action: null,
      actionLabel: null,
      description:
        "Updates are disabled in development builds. Use a packaged AI Harness installer to test updates.",
      label: "Unavailable",
      title: "App updates are unavailable",
    }
  if (state.status === "error")
    return {
      action: "check",
      actionLabel: "Try again",
      description:
        state.error ?? "AI Harness could not complete the update request.",
      label: "Error",
      title: "The update request failed",
    }
  return {
    action: "check",
    actionLabel: "Check for updates",
    description: "Check the release feed for a newer version of AI Harness.",
    label: "Ready",
    title: "Ready to check",
  }
}

export function DesktopUpdater() {
  const [actionError, setActionError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<DesktopUpdaterState | null>(null)
  const lastStateKey = useRef("")
  const presentation = getDesktopUpdaterPresentation(state)

  useEffect(() => {
    const openDialog = () => setOpen(true)
    window.addEventListener(OPEN_APP_UPDATES_EVENT, openDialog)

    const updater = window.aiHarnessDesktop?.updater
    if (!updater)
      return () =>
        window.removeEventListener(OPEN_APP_UPDATES_EVENT, openDialog)

    const showState = (nextState: DesktopUpdaterState) => {
      setState(nextState)
      setActionError(null)

      const stateKey = [
        nextState.status,
        nextState.availableVersion,
        nextState.progress === null ? "" : Math.floor(nextState.progress),
        nextState.error,
      ].join(":")
      if (stateKey === lastStateKey.current) return
      lastStateKey.current = stateKey

      if (nextState.status === "update-available") {
        toast.info(`AI Harness ${nextState.availableVersion} is available`, {
          id: UPDATE_TOAST_ID,
          description: "Open App updates to download it.",
          duration: Infinity,
          action: {
            label: "View",
            onClick: openDesktopUpdaterDialog,
          },
        })
      } else if (nextState.status === "downloading") {
        toast.loading("Downloading AI Harness update", {
          id: UPDATE_TOAST_ID,
          description:
            nextState.progress === null
              ? "The download is running in the background."
              : `${Math.floor(nextState.progress)}% complete`,
        })
      } else if (nextState.status === "ready-to-install") {
        toast.success(
          `AI Harness ${nextState.availableVersion ?? "update"} is ready`,
          {
            id: UPDATE_TOAST_ID,
            description: "Open App updates when you are ready to restart.",
            duration: Infinity,
            action: {
              label: "Restart",
              onClick: openDesktopUpdaterDialog,
            },
          }
        )
      } else if (nextState.status === "installing") {
        toast.loading("Restarting AI Harness", { id: UPDATE_TOAST_ID })
      } else if (nextState.status === "error" && nextState.error) {
        toast.error("The desktop update request failed", {
          id: UPDATE_TOAST_ID,
          description: nextState.error,
        })
      } else if (["idle", "up-to-date"].includes(nextState.status)) {
        toast.dismiss(UPDATE_TOAST_ID)
      }
    }

    const unsubscribe = updater.onState(showState)
    void updater.getState().then(showState, () => undefined)
    return () => {
      unsubscribe()
      window.removeEventListener(OPEN_APP_UPDATES_EVENT, openDialog)
    }
  }, [])

  async function runAction(action: Exclude<UpdaterAction, null>) {
    const updater = window.aiHarnessDesktop?.updater
    if (!updater) return
    setActionError(null)
    try {
      const nextState = await updater[action]()
      setState(nextState)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "The update request failed."
      )
    }
  }

  const busy =
    state?.status === "checking" ||
    state?.status === "downloading" ||
    state?.status === "installing"
  const showProgress =
    state?.status === "downloading" || state?.status === "ready-to-install"
  const error = actionError ?? (state?.status === "error" ? state.error : null)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/70 px-5 py-4 pr-14 sm:px-6">
          <DialogTitle>App updates</DialogTitle>
          <DialogDescription>
            Keep the AI Harness desktop app current.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-5 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
              <HugeiconsIcon
                aria-hidden="true"
                icon={
                  state?.status === "error"
                    ? Alert02Icon
                    : state?.status === "up-to-date"
                      ? CheckmarkCircle02Icon
                      : state?.status === "downloading"
                        ? Download04Icon
                        : SystemUpdate02Icon
                }
                strokeWidth={1.8}
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-base font-semibold tracking-tight">
                  {presentation.title}
                </h2>
                <Badge
                  variant={
                    state?.status === "error" ? "destructive" : "outline"
                  }
                >
                  {presentation.label}
                </Badge>
              </div>
              <p
                aria-live="polite"
                className="mt-1.5 text-sm leading-relaxed text-muted-foreground"
              >
                {presentation.description}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-muted/40 p-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Installed</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {state?.currentVersion ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Available</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {state?.availableVersion ?? "—"}
              </dd>
            </div>
          </dl>

          {showProgress ? (
            <Progress className="mt-5" value={state.progress ?? 0}>
              <ProgressLabel>Download progress</ProgressLabel>
              <ProgressValue />
            </Progress>
          ) : null}

          {error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/20 px-5 py-4 sm:px-6">
          {busy ? (
            <Button disabled>
              <Spinner />
              {state.status === "checking"
                ? "Checking"
                : state.status === "downloading"
                  ? `${Math.floor(state.progress ?? 0)}% downloaded`
                  : "Restarting"}
            </Button>
          ) : presentation.action && presentation.actionLabel ? (
            <Button onClick={() => void runAction(presentation.action!)}>
              {presentation.actionLabel}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
