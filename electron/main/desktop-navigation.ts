export const DESKTOP_ENTRY_PATH = "/desktop"

const DESKTOP_AUTH_ORIGINS = new Set([
  "https://accounts.a2zsoftware.ca",
  "https://clerk.a2zsoftware.ca",
  "https://github.com",
])

const DESKTOP_AUTH_CALLBACK_ORIGINS = new Set([
  "https://accounts.a2zsoftware.ca",
  "https://clerk.a2zsoftware.ca",
])

const DESKTOP_AUTH_CALLBACK_PATHS = new Set([
  "/oauth_callback",
  "/v1/oauth_callback",
])

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

export function isAllowedDesktopAuthNavigation(target: string) {
  try {
    const url = new URL(target)
    return url.protocol === "https:" && DESKTOP_AUTH_ORIGINS.has(url.origin)
  } catch {
    return false
  }
}

export function isDesktopAuthCallback(target: string) {
  try {
    const url = new URL(target)
    return (
      DESKTOP_AUTH_CALLBACK_ORIGINS.has(url.origin) &&
      DESKTOP_AUTH_CALLBACK_PATHS.has(url.pathname)
    )
  } catch {
    return false
  }
}
