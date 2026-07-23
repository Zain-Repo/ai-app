import fs from "node:fs"

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u

export function readReleaseVersion(packageJsonPath: string) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown
  }
  const override = process.env.AI_HARNESS_RELEASE_VERSION?.trim()
  const version = override || packageJson.version
  if (typeof version !== "string" || !VERSION_PATTERN.test(version))
    throw new Error("package.json must contain a valid semantic version")
  return version
}
