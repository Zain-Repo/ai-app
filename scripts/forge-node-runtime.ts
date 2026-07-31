export function isSupportedForgeNodeVersion(version: string) {
  const [major = 0, minor = 0] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  return major < 24 || (major === 24 && minor < 16)
}

export function isLocalOnlyPackage(args: readonly string[]) {
  return args.includes("--local-only")
}

export function forgePackageMode(args: readonly string[]) {
  const localOnly = isLocalOnlyPackage(args)
  const store = args.includes("--store")
  if (localOnly && store)
    throw new Error("Package mode cannot be both local-only and Store")
  return localOnly ? "local-only" : store ? "store" : "release"
}

export function unsignedPackageMetadata(
  mode: ReturnType<typeof forgePackageMode>,
  metadata: Readonly<Record<string, unknown>>
) {
  const unsignedMetadata: Record<string, unknown> = { ...metadata }
  delete unsignedMetadata.signing
  delete unsignedMetadata.distribution
  delete unsignedMetadata.localOnly
  unsignedMetadata.unsigned = true
  if (mode === "local-only") return { ...unsignedMetadata, localOnly: true }
  return {
    ...unsignedMetadata,
    distribution: mode === "store" ? "microsoft-store" : "github-updater",
  }
}
