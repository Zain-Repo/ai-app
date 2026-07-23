export const DESKTOP_ENTRY_PATH = "/desktop"

const ALLOWED_PATHS = [
  "/chat",
  "/desktop/sign-in",
  "/desktop/sign-up",
  "/provider-callback/openrouter",
  "/sign-in",
  "/sign-up",
] as const

function isPathWithin(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function desktopEntryUrl(rendererUrl: URL) {
  const url = new URL(rendererUrl)
  url.pathname = DESKTOP_ENTRY_PATH
  url.search = ""
  url.hash = ""
  return url
}

export function isAllowedDesktopNavigation(
  target: string,
  trustedOrigin: string
) {
  try {
    const url = new URL(target)
    return (
      url.origin === trustedOrigin &&
      (url.pathname === DESKTOP_ENTRY_PATH ||
        ALLOWED_PATHS.some((path) => isPathWithin(url.pathname, path)))
    )
  } catch {
    return false
  }
}
