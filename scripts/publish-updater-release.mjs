import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

import {
  publishUpdaterRelease,
  UPDATER_REPOSITORY,
} from "./github-updater-release.mjs"

function arg(name) {
  const prefix = `--${name}=`
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length)
}

const root = path.resolve(import.meta.dirname, "..")
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8")
)
const version = packageJson.version
const tag = arg("tag") || `v${version}`
const target = arg("target")
if (!target || !/^[0-9a-f]{40}$/i.test(target))
  throw new Error("--target must be a full 40-character tested commit SHA")
const notes = arg("notes") || `AI Harness ${version} desktop release.`
const installer = path.resolve(
  arg("file") || path.join(root, "out", "nsis", "ai-harness-setup.exe")
)
const packageMetadata = JSON.parse(
  fs.readFileSync(
    path.join(root, "out", "latest-package-client-win32-x64.json"),
    "utf8"
  )
)
if (
  packageMetadata.distribution !== "github-updater" ||
  packageMetadata.unsigned !== true ||
  packageMetadata.localOnly === true ||
  "signing" in packageMetadata ||
  typeof packageMetadata.outputPath !== "string" ||
  !fs.existsSync(packageMetadata.outputPath)
)
  throw new Error("Packaged app metadata is missing")
const packagedExecutable = path.join(
  packageMetadata.outputPath,
  "ai-harness.exe"
)
if (
  !fs.existsSync(packagedExecutable) ||
  !fs.statSync(packagedExecutable).isFile()
)
  throw new Error("The packaged app executable is missing")
const packagedCodex = path.join(
  packageMetadata.outputPath,
  "resources",
  "x86_64-pc-windows-msvc",
  "bin",
  "codex.exe"
)
if (!fs.existsSync(packagedCodex))
  throw new Error("The packaged Codex CLI is missing")
const codexVersion = execFileSync(packagedCodex, ["--version"], {
  encoding: "utf8",
  windowsHide: true,
})
  .trim()
  .match(/^codex-cli\s+(\S+)$/)?.[1]
if (!codexVersion) throw new Error("The packaged Codex version is invalid")

const latestCodexResponse = await fetch(
  "https://registry.npmjs.org/@openai%2Fcodex/latest",
  { signal: AbortSignal.timeout(10_000) }
)
if (!latestCodexResponse.ok)
  throw new Error("Could not verify the latest Codex CLI release")
const latestCodex = await latestCodexResponse.json()
if (
  !latestCodex ||
  typeof latestCodex !== "object" ||
  typeof latestCodex.version !== "string"
)
  throw new Error("OpenAI returned an invalid Codex release")
if (latestCodex.version !== codexVersion)
  throw new Error(
    `Packaged Codex CLI ${codexVersion} is behind OpenAI ${latestCodex.version}; update @openai/codex and rebuild before publishing`
  )

const runtimeManifest = path.join(path.dirname(installer), "codex-runtime.json")
fs.writeFileSync(
  runtimeManifest,
  `${JSON.stringify({ appVersion: version, codexVersion }, null, 2)}\n`,
  "utf8"
)
const assets = [
  installer,
  `${installer}.blockmap`,
  path.join(path.dirname(installer), "latest.yml"),
  runtimeManifest,
]
for (const asset of assets)
  if (
    !fs.existsSync(asset) ||
    !fs.statSync(asset).isFile() ||
    fs.statSync(asset).size === 0
  )
    throw new Error(`Updater asset not found: ${asset}`)

function gh(args) {
  return execFileSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

const repositoryInfo = JSON.parse(
  gh(["repo", "view", UPDATER_REPOSITORY, "--json", "visibility"])
)
if (repositoryInfo.visibility !== "PUBLIC")
  throw new Error(
    `Updater repository ${UPDATER_REPOSITORY} must be public so installed clients can fetch releases without a bundled GitHub credential`
  )

publishUpdaterRelease({
  runGh: gh,
  tag,
  target,
  title: `AI Harness ${version}`,
  notes,
  assets,
})
console.log(`Published ${tag} updater assets to ${UPDATER_REPOSITORY}`)
