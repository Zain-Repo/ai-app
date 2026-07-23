import asar from "@electron/asar"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"

const root = path.resolve(import.meta.dirname, "..")
const packageJsonPath = path.join(root, "package.json")
const builderConfigPath = path.join(root, "electron-builder.json")
const metadataPath = path.join(
  root,
  "out",
  "latest-package-client-win32-x64.json"
)
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
const builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, "utf8"))

if (!fs.existsSync(metadataPath))
  throw new Error(
    "Run `bun run package:client` before `bun run installer:nsis`"
  )
const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"))
if (
  typeof metadata.outputPath !== "string" ||
  !fs.existsSync(metadata.outputPath)
)
  throw new Error("Current package metadata does not point to a packaged app")

const appAsarPath = path.join(metadata.outputPath, "resources", "app.asar")
const packagedPackageJson = JSON.parse(
  asar.extractFile(appAsarPath, "package.json").toString("utf8")
)
if (packagedPackageJson.version !== packageJson.version)
  throw new Error(
    `Packaged app version ${packagedPackageJson.version} does not match ${packageJson.version}`
  )

const publish = Array.isArray(builderConfig.publish)
  ? builderConfig.publish[0]
  : builderConfig.publish
if (!publish || typeof publish !== "object")
  throw new Error("electron-builder.json must define a publish provider")
fs.writeFileSync(
  path.join(metadata.outputPath, "resources", "app-update.yml"),
  yaml.dump(
    { ...publish, updaterCacheDirName: "ai-app-updater" },
    { noRefs: true }
  ),
  "utf8"
)

const releaseConfigPath = path.join(
  root,
  "out",
  "electron-builder-release.json"
)
fs.writeFileSync(
  releaseConfigPath,
  `${JSON.stringify(
    {
      ...builderConfig,
      extraMetadata: {
        ...(builderConfig.extraMetadata ?? {}),
        version: packageJson.version,
      },
    },
    null,
    2
  )}\n`,
  "utf8"
)
const builderCli = path.join(root, "node_modules", "electron-builder", "cli.js")
const result = spawnSync(
  "node",
  [
    builderCli,
    "--win",
    "nsis",
    "--x64",
    "--publish",
    "never",
    "--config",
    releaseConfigPath,
    "--prepackaged",
    metadata.outputPath,
  ],
  { cwd: root, stdio: "inherit", windowsHide: true }
)
if (result.error) throw result.error
process.exit(result.status ?? 1)
