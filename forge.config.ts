import { FusesPlugin } from "@electron-forge/plugin-fuses"
import { VitePlugin } from "@electron-forge/plugin-vite"
import type { ForgeConfig } from "@electron-forge/shared-types"
import { FuseV1Options, FuseVersion } from "@electron/fuses"
import fs from "node:fs"
import path from "node:path"

const projectRoot = path.resolve(process.cwd())
const packageOutDir =
  process.env.AI_HARNESS_PACKAGE_OUT_DIR?.trim() ||
  path.join(projectRoot, "out")
const packageMetadataPath =
  process.env.AI_HARNESS_PACKAGE_METADATA_PATH?.trim() || null
const releaseVersion = process.env.AI_HARNESS_RELEASE_VERSION?.trim() || null
const packagePlatform =
  process.env.AI_HARNESS_PACKAGE_PLATFORM?.trim() || process.platform
const packageArch = process.env.AI_HARNESS_PACKAGE_ARCH?.trim() || process.arch
const desktopConfigPath = path.join(
  projectRoot,
  "out",
  "runtime",
  "desktop-config.json"
)

function codexTargetTriple() {
  if (packagePlatform === "win32" && packageArch === "x64")
    return "x86_64-pc-windows-msvc"
  if (packagePlatform === "win32" && packageArch === "arm64")
    return "aarch64-pc-windows-msvc"
  if (packagePlatform === "darwin" && packageArch === "x64")
    return "x86_64-apple-darwin"
  if (packagePlatform === "darwin" && packageArch === "arm64")
    return "aarch64-apple-darwin"
  if (packagePlatform === "linux" && packageArch === "x64")
    return "x86_64-unknown-linux-musl"
  if (packagePlatform === "linux" && packageArch === "arm64")
    return "aarch64-unknown-linux-musl"
  throw new Error(`Codex does not support ${packagePlatform}-${packageArch}`)
}

const codexRuntimePath = path.join(
  projectRoot,
  "node_modules",
  `@openai/codex-${packagePlatform}-${packageArch}`,
  "vendor",
  codexTargetTriple()
)

function writeDesktopConfig() {
  const rendererUrl = process.env.AI_HARNESS_DESKTOP_URL?.trim()
  if (!rendererUrl) {
    throw new Error(
      "Missing AI_HARNESS_DESKTOP_URL. Set the deployed https application URL before packaging."
    )
  }
  const parsed = new URL(rendererUrl)
  if (parsed.protocol !== "https:")
    throw new Error("AI_HARNESS_DESKTOP_URL must use https for packaging")
  fs.mkdirSync(path.dirname(desktopConfigPath), { recursive: true })
  fs.writeFileSync(
    desktopConfigPath,
    `${JSON.stringify({ rendererUrl: parsed.toString() }, null, 2)}\n`,
    "utf8"
  )
}

const config: ForgeConfig = {
  outDir: packageOutDir,
  hooks: {
    prePackage: async () => writeDesktopConfig(),
    postPackage: async (_forgeConfig, options) => {
      const outputPath = options.outputPaths[0]
      if (!packageMetadataPath || !outputPath) return
      fs.mkdirSync(path.dirname(packageMetadataPath), { recursive: true })
      fs.writeFileSync(
        packageMetadataPath,
        `${JSON.stringify(
          {
            role: "client",
            platform: packagePlatform,
            arch: packageArch,
            createdAt: new Date().toISOString(),
            outputPath,
            outputPaths: options.outputPaths,
          },
          null,
          2
        )}\n`,
        "utf8"
      )
    },
  },
  packagerConfig: {
    name: "ai-harness",
    executableName: "ai-harness",
    ...(releaseVersion
      ? { appVersion: releaseVersion, buildVersion: releaseVersion }
      : {}),
    icon: path.join(projectRoot, "public", "favicon"),
    appBundleId: "com.zain.ai-harness",
    appCategoryType: "public.app-category.productivity",
    win32metadata: {
      ProductName: "AI Harness",
      InternalName: "ai-harness",
      FileDescription: "AI Harness desktop client",
      OriginalFilename: "ai-harness.exe",
    },
    asar: true,
    extraResource: [desktopConfigPath, codexRuntimePath],
  },
  makers: [],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "electron/main/index.ts",
          config: "vite.electron.main.config.mts",
          target: "main",
        },
        {
          entry: "electron/preload/index.ts",
          config: "vite.electron.preload.config.mts",
          target: "preload",
        },
      ],
      renderer: [],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}

export default config
