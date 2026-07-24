import asar from "@electron/asar"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"

const STORE_SIGNING_ENVIRONMENT = [
  "CSC_KEY_PASSWORD",
  "CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "WIN_CSC_LINK",
]

function required(name, env) {
  const value = env[name]?.trim()
  if (!value)
    throw new Error(`Missing required Microsoft Store identity: ${name}`)
  return value
}

export function storeIdentity(env = process.env) {
  const identityName = required("MICROSOFT_STORE_IDENTITY_NAME", env)
  if (!/^[A-Za-z0-9.-]{3,50}$/u.test(identityName))
    throw new Error(
      "MICROSOFT_STORE_IDENTITY_NAME is not a valid package identity"
    )

  const applicationId =
    env.MICROSOFT_STORE_APPLICATION_ID?.trim() || "AIHarness"
  if (
    applicationId.length > 64 ||
    !/^([A-Za-z][A-Za-z0-9]*)(\.[A-Za-z][A-Za-z0-9]*)*$/u.test(applicationId)
  )
    throw new Error("MICROSOFT_STORE_APPLICATION_ID is not valid")

  return {
    applicationId,
    identityName,
    publisher: required("MICROSOFT_STORE_PUBLISHER", env),
    publisherDisplayName: required(
      "MICROSOFT_STORE_PUBLISHER_DISPLAY_NAME",
      env
    ),
  }
}

export function storeBuilderEnvironment(env = process.env) {
  const result = { ...env, CSC_IDENTITY_AUTO_DISCOVERY: "false" }
  for (const name of STORE_SIGNING_ENVIRONMENT) delete result[name]
  return result
}

export function storeBuilderConfig(builderConfig, version, identity) {
  return {
    ...builderConfig,
    artifactName: "ai-harness-store-${version}-${arch}.${ext}",
    directories: {
      ...builderConfig.directories,
      output: "out/store",
    },
    extraMetadata: {
      ...(builderConfig.extraMetadata ?? {}),
      version,
    },
    forceCodeSigning: false,
    publish: [],
    win: {
      ...builderConfig.win,
      target: [{ arch: ["x64"], target: "appx" }],
    },
    appx: {
      ...identity,
      displayName: "AI Harness",
      languages: ["en-US"],
    },
  }
}

function run() {
  const root = path.resolve(import.meta.dirname, "..")
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  )
  const builderConfig = JSON.parse(
    fs.readFileSync(path.join(root, "electron-builder.json"), "utf8")
  )
  const metadataPath = path.join(
    root,
    "out",
    "latest-package-client-win32-x64.json"
  )
  if (!fs.existsSync(metadataPath))
    throw new Error(
      "Run `bun run package:client:store` before `bun run installer:store`"
    )

  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"))
  if (
    metadata.distribution !== "microsoft-store" ||
    metadata.signing ||
    metadata.localOnly === true ||
    typeof metadata.outputPath !== "string" ||
    !fs.existsSync(metadata.outputPath)
  )
    throw new Error("Store installer requires a fresh unsigned Store package")

  const appAsarPath = path.join(metadata.outputPath, "resources", "app.asar")
  const packagedPackageJson = JSON.parse(
    asar.extractFile(appAsarPath, "package.json").toString("utf8")
  )
  if (packagedPackageJson.version !== packageJson.version)
    throw new Error(
      `Packaged app version ${packagedPackageJson.version} does not match ${packageJson.version}`
    )
  if (
    fs.existsSync(path.join(metadata.outputPath, "resources", "app-update.yml"))
  )
    throw new Error(
      "Microsoft Store package must not contain the GitHub updater feed"
    )

  const configPath = path.join(root, "out", "electron-builder-store.json")
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      storeBuilderConfig(builderConfig, packageJson.version, storeIdentity()),
      null,
      2
    )}\n`,
    "utf8"
  )

  const artifactPath = path.join(
    root,
    "out",
    "store",
    `ai-harness-store-${packageJson.version}-x64.appx`
  )
  const startedAt = Date.now()
  const result = spawnSync(
    "node",
    [
      path.join(root, "node_modules", "electron-builder", "cli.js"),
      "--win",
      "appx",
      "--x64",
      "--publish",
      "never",
      "--config",
      configPath,
      "--prepackaged",
      metadata.outputPath,
    ],
    {
      cwd: root,
      env: storeBuilderEnvironment(),
      stdio: "inherit",
      windowsHide: true,
    }
  )
  if (result.error) throw result.error
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1)

  const artifact = fs.statSync(artifactPath)
  if (!artifact.isFile() || artifact.mtimeMs < startedAt - 2_000)
    throw new Error(
      "electron-builder did not create a fresh Store AppX package"
    )
  console.log(`Built unsigned Microsoft Store package at ${artifactPath}`)
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)
  run()
