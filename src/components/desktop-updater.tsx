import { useEffect, useRef } from "react"
import { toast } from "sonner"

import type { DesktopUpdaterState } from "../../electron/types"

const UPDATE_TOAST_ID = "desktop-updater"

export function DesktopUpdater() {
  const lastStateKey = useRef("")

  useEffect(() => {
    const updater = window.aiHarnessDesktop?.updater
    if (!updater) return

    const showState = (state: DesktopUpdaterState) => {
      const stateKey = [
        state.status,
        state.availableVersion,
        state.progress === null ? "" : Math.floor(state.progress),
        state.error,
      ].join(":")
      if (stateKey === lastStateKey.current) return
      lastStateKey.current = stateKey

      if (state.status === "idle" && state.availableVersion) {
        toast.info(`AI Harness ${state.availableVersion} is available`, {
          id: UPDATE_TOAST_ID,
          description:
            "Download the update in the background when you are ready.",
          duration: Infinity,
          action: {
            label: "Download",
            onClick: () => {
              void updater.download().catch((error: unknown) =>
                toast.error("The update could not be downloaded", {
                  id: UPDATE_TOAST_ID,
                  description:
                    error instanceof Error ? error.message : "Try again later.",
                })
              )
            },
          },
        })
        return
      }

      if (state.status === "downloading") {
        toast.loading("Downloading AI Harness update", {
          id: UPDATE_TOAST_ID,
          description:
            state.progress === null
              ? "The download is running in the background."
              : `${Math.floor(state.progress)}% complete`,
        })
        return
      }

      if (state.status === "ready") {
        toast.success(
          `AI Harness ${state.availableVersion ?? "update"} is ready`,
          {
            id: UPDATE_TOAST_ID,
            description: "Restart the desktop app to finish installing it.",
            duration: Infinity,
            action: {
              label: "Restart",
              onClick: () => void updater.install(),
            },
          }
        )
        return
      }

      if (state.status === "error" && state.error) {
        toast.error("The desktop update check failed", {
          id: UPDATE_TOAST_ID,
          description: state.error,
        })
      }
    }

    const unsubscribe = updater.onState(showState)
    void updater.getState().then(showState, () => undefined)
    return unsubscribe
  }, [])

  return null
}
