import { extractFile } from "@electron/asar"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { isSupportedForgeNodeVersion } from "./forge-node-runtime"
import { readReleaseVersion } from "./release-version"

function arg(name: string) {
  const prefix = `--${name}=`
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
}

const root = path.resolve(import.meta.dirname, "..")
const role = arg("role") || "client"
const platform = arg("platform") || "win32"
const arch = arg("arch") || "x64"
const runId = new Date().toISOString().replace(/[:.]/gu, "-")
const outputRoot = path.join(
  root,
  "out",
  "packages",
  `${role}-${platform}-${arch}-${runId}`
)
const metadataPath = path.join(
  root,
  "out",
  `latest-package-${role}-${platform}-${arch}.json`
)
const forgeCli = path.join(
  root,
  "node_modules",
  "@electron-forge",
  "cli",
  "dist",
  "electron-forge.js"
)
const version = readReleaseVersion(path.join(root, "package.json"))
const env = {
  ...process.env,
  AI_HARNESS_PACKAGE_OUT_DIR: outputRoot,
  AI_HARNESS_PACKAGE_METADATA_PATH: metadataPath,
  AI_HARNESS_PACKAGE_PLATFORM: platform,
  AI_HARNESS_PACKAGE_ARCH: arch,
  AI_HARNESS_RELEASE_VERSION: version,
}

fs.mkdirSync(path.dirname(outputRoot), { recursive: true })

function nodeVersion(executable: string) {
  const result = spawnSync(executable, ["-p", "process.versions.node"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  })
  return result.status === 0 ? result.stdout.trim() : null
}

function forgeNode() {
  const candidates = [
    process.env.AI_HARNESS_FORGE_NODE?.trim(),
    path.join(
      os.homedir(),
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "bin",
      process.platform === "win32" ? "node.exe" : "node"
    ),
    "node",
  ].filter((value): value is string => Boolean(value))
  return (
    candidates.find((candidate) => {
      const candidateVersion = nodeVersion(candidate)
      return candidateVersion
        ? isSupportedForgeNodeVersion(candidateVersion)
        : false
    }) || "node"
  )
}

const nodeExecutable = forgeNode()
console.log(
  `Running Electron Forge with ${nodeExecutable} (${nodeVersion(nodeExecutable) ?? "unknown"})`
)
const result = spawnSync(
  nodeExecutable,
  [forgeCli, "package", "--platform", platform, "--arch", arch],
  { cwd: root, env, stdio: "inherit", windowsHide: true }
)
if (result.error) throw result.error
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as {
  outputPath?: unknown
}
const outputPath =
  typeof metadata.outputPath === "string"
    ? path.resolve(metadata.outputPath)
    : null
if (
  !outputPath ||
  !outputPath.startsWith(`${path.resolve(outputRoot)}${path.sep}`) ||
  !fs.existsSync(path.join(outputPath, "resources", "app.asar"))
)
  throw new Error("Electron Forge did not produce a fresh packaged app")

const appAsarPath = path.join(outputPath, "resources", "app.asar")
const packagedManifest = JSON.parse(
  extractFile(appAsarPath, "package.json").toString("utf8")
) as { main?: unknown }
if (packagedManifest.main !== ".vite/build/index.cjs")
  throw new Error("Packaged Electron main entry is not CommonJS")
extractFile(appAsarPath, path.normalize(packagedManifest.main))
extractFile(appAsarPath, path.join(".vite", "build", "preload.cjs"))

console.log(`Packaged client app at ${outputPath}`)
