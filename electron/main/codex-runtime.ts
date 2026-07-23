const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function isVersion(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    VERSION_PATTERN.test(value)
  )
}

export function parseCodexVersion(output: string) {
  const version = output.trim().match(/^codex-cli\s+(\S+)$/)?.[1]
  if (!isVersion(version)) throw new Error("Codex returned an invalid version")
  return version
}

export function parseCodexRuntimeManifest(
  value: unknown,
  expectedAppVersion: string
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The Codex runtime manifest is invalid")
  const manifest = value as Record<string, unknown>
  if (
    manifest.appVersion !== expectedAppVersion ||
    !isVersion(manifest.codexVersion)
  )
    throw new Error("The Codex runtime manifest does not match this update")
  return manifest.codexVersion
}

export async function fetchReleaseCodexVersion(appVersion: string) {
  if (!isVersion(appVersion))
    throw new Error("The app update version is invalid")
  const response = await fetch(
    `https://github.com/Zain-Repo/ai-harness-releases/releases/download/v${encodeURIComponent(appVersion)}/codex-runtime.json`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!response.ok)
    throw new Error("Codex details are unavailable for this app update")
  const body = await response.text()
  if (body.length > 4_096)
    throw new Error("The Codex runtime manifest is too large")
  try {
    return parseCodexRuntimeManifest(JSON.parse(body), appVersion)
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new Error("The Codex runtime manifest is invalid")
    throw error
  }
}
