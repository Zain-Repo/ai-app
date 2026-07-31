import asar from "@electron/asar"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"

import { unsignedWindowsEnvironment } from "./unsigned-windows-environment.mjs"

const root = path.resolve(import.meta.dirname, "..")
const localOnly = process.argv.includes("--local-only")
const packageJsonPath = path.join(root, "package.json")
const builderConfigPath = path.join(root, "electron-builder.json")
const metadataPath = path.join(
  root,
  "out",
  "latest-package-client-win32-x64.json"
)
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"))
const builderConfig = JSON.parse(fs.readFileSync(builderConfigPath, "utf8"))
const unsignedWinConfig = { ...builderConfig.win }
delete unsignedWinConfig.signtoolOptions

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
if (localOnly) {
  if (
    metadata.localOnly !== true ||
    metadata.unsigned !== true ||
    "signing" in metadata
  )
    throw new Error(
      "Local installer requires unsigned local-only package metadata"
    )
} else {
  if (
    metadata.distribution !== "github-updater" ||
    metadata.unsigned !== true ||
    metadata.localOnly === true ||
    "signing" in metadata
  )
    throw new Error("Updater installer requires a fresh unsigned package")
}

const packagedExecutable = path.join(
  metadata.outputPath,
  `${builderConfig.executableName}.exe`
)
if (
  !fs.existsSync(packagedExecutable) ||
  !fs.statSync(packagedExecutable).isFile()
)
  throw new Error("Packaged app executable is missing")

const appAsarPath = path.join(metadata.outputPath, "resources", "app.asar")
const packagedPackageJson = JSON.parse(
  asar.extractFile(appAsarPath, "package.json").toString("utf8")
)
if (packagedPackageJson.version !== packageJson.version)
  throw new Error(
    `Packaged app version ${packagedPackageJson.version} does not match ${packageJson.version}`
  )

if (!localOnly) {
  const publish = Array.isArray(builderConfig.publish)
    ? builderConfig.publish[0]
    : builderConfig.publish
  if (!publish || typeof publish !== "object")
    throw new Error("electron-builder.json must define a publish provider")
  fs.writeFileSync(
    path.join(metadata.outputPath, "resources", "app-update.yml"),
    yaml.dump(
      {
        ...publish,
        updaterCacheDirName: "ai-app-updater",
      },
      { noRefs: true }
    ),
    "utf8"
  )
}

const releaseConfigPath = path.join(
  root,
  "out",
  localOnly ? "electron-builder-local.json" : "electron-builder-release.json"
)
fs.writeFileSync(
  releaseConfigPath,
  `${JSON.stringify(
    {
      ...builderConfig,
      ...(localOnly
        ? {
            artifactName: "ai-harness-local-setup.${ext}",
            directories: {
              ...builderConfig.directories,
              output: "out/local-nsis",
            },
            publish: [],
          }
        : {}),
      forceCodeSigning: false,
      extraMetadata: {
        ...(builderConfig.extraMetadata ?? {}),
        version: packageJson.version,
      },
      win: unsignedWinConfig,
    },
    null,
    2
  )}\n`,
  "utf8"
)
const builderCli = path.join(root, "node_modules", "electron-builder", "cli.js")
const buildStartedAt = Date.now()
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
  {
    cwd: root,
    env: unsignedWindowsEnvironment(process.env),
    stdio: "inherit",
    windowsHide: true,
  }
)
if (result.error) throw result.error
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
const installerDirectory = path.join(
  root,
  "out",
  localOnly ? "local-nsis" : "nsis"
)
const installerPath = path.join(
  installerDirectory,
  localOnly ? "ai-harness-local-setup.exe" : "ai-harness-setup.exe"
)
const expectedArtifacts = localOnly
  ? [installerPath]
  : [
      installerPath,
      `${installerPath}.blockmap`,
      path.join(installerDirectory, "latest.yml"),
    ]
for (const artifactPath of expectedArtifacts) {
  if (!fs.existsSync(artifactPath))
    throw new Error(`electron-builder did not create ${artifactPath}`)
  const artifact = fs.statSync(artifactPath)
  if (!artifact.isFile() || artifact.size === 0)
    throw new Error(
      `electron-builder created an invalid artifact: ${artifactPath}`
    )
  if (artifact.mtimeMs < buildStartedAt - 2_000)
    throw new Error(
      `electron-builder did not refresh artifact: ${artifactPath}`
    )
}

if (localOnly) {
  fs.rmSync(`${installerPath}.blockmap`, { force: true })
  fs.rmSync(path.join(installerDirectory, "latest.yml"), {
    force: true,
  })
  console.log(`Built unsigned local-only installer at ${installerPath}`)
} else {
  console.log(`Built unsigned updater installer at ${installerPath}`)
}
