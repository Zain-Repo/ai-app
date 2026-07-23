import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

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
const repository = arg("repo") || "Zain-Repo/ai-app-releases"
const tag = arg("tag") || `v${version}`
const notes = arg("notes") || `AI Harness ${version} desktop release.`
const installer = path.resolve(
  arg("file") ||
    path.join(root, "out", "nsis", `ai-harness-setup-${version}.exe`)
)
const assets = [
  installer,
  `${installer}.blockmap`,
  path.join(path.dirname(installer), "latest.yml"),
]
for (const asset of assets)
  if (!fs.existsSync(asset))
    throw new Error(`Updater asset not found: ${asset}`)

function gh(args) {
  return execFileSync("gh", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  })
}

const repositoryInfo = JSON.parse(
  gh(["repo", "view", repository, "--json", "visibility"])
)
if (repositoryInfo.visibility !== "PUBLIC")
  throw new Error(
    `Updater repository ${repository} must be public so installed clients can fetch releases without a bundled GitHub credential`
  )

try {
  gh(["release", "view", tag, "--repo", repository])
} catch {
  gh([
    "release",
    "create",
    tag,
    "--repo",
    repository,
    "--title",
    `AI Harness ${version}`,
    "--notes",
    notes,
  ])
}
gh(["release", "upload", tag, ...assets, "--repo", repository, "--clobber"])
console.log(`Published ${tag} updater assets to ${repository}`)
