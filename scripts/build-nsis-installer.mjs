import asar from "@electron/asar"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import yaml from "js-yaml"

import { assertTrustedSignature } from "./windows-signing.mjs"

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
const publisherName = process.env.WINDOWS_SIGN_PUBLISHER_NAME?.trim()
if (!localOnly && !publisherName)
  throw new Error(
    "Missing WINDOWS_SIGN_PUBLISHER_NAME for updater signature verification"
  )

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
  if (metadata.localOnly !== true || metadata.signing)
    throw new Error(
      "Local installer requires unsigned local-only package metadata"
    )
} else {
  if (
    metadata.signing?.tool !== "osslsigncode" ||
    metadata.signing?.digest !== "sha256" ||
    metadata.signing?.trust !== "windows" ||
    metadata.signing?.publisherName !== publisherName
  )
    throw new Error(
      "Packaged app was not signed by the configured Windows publisher"
    )
  assertTrustedSignature(
    path.join(metadata.outputPath, `${builderConfig.executableName}.exe`),
    publisherName
  )
}

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
        publisherName: [publisherName],
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
            forceCodeSigning: false,
            publish: [],
          }
        : { forceCodeSigning: true }),
      extraMetadata: {
        ...(builderConfig.extraMetadata ?? {}),
        version: packageJson.version,
      },
      win: localOnly
        ? builderConfig.win
        : {
            ...builderConfig.win,
            signtoolOptions: {
              ...(builderConfig.win?.signtoolOptions ?? {}),
              publisherName,
              sign: "./scripts/windows-signing.mjs",
              signingHashAlgorithms: ["sha256"],
            },
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
  {
    cwd: root,
    env: localOnly
      ? { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: "false" }
      : process.env,
    stdio: "inherit",
    windowsHide: true,
  }
)
if (result.error) throw result.error
if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)
if (localOnly) {
  const installerPath = path.join(
    root,
    "out",
    "local-nsis",
    "ai-harness-local-setup.exe"
  )
  if (!fs.existsSync(installerPath))
    throw new Error("electron-builder did not create the local-only installer")
  fs.rmSync(`${installerPath}.blockmap`, { force: true })
  fs.rmSync(path.join(path.dirname(installerPath), "latest.yml"), {
    force: true,
  })
  console.log(`Built unsigned local-only installer at ${installerPath}`)
}
