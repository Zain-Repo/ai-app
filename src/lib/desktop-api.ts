import type { Dev3DesktopApi } from "../../electron/types"

export function getDesktopApi(): Dev3DesktopApi | undefined {
  if (typeof window === "undefined") return undefined
  return window.dev3Desktop ?? window.aiHarnessDesktop
}
