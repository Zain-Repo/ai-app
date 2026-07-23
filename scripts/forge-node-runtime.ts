export function isSupportedForgeNodeVersion(version: string) {
  const [major = 0, minor = 0] = version
    .split(".")
    .map((part) => Number.parseInt(part, 10))
  return major < 24 || (major === 24 && minor < 16)
}
