import fs from "node:fs"
import path from "node:path"

export const LEGACY_INSTALLER_NAME = "ai-harness-setup.exe"

function assertUpdaterAsset(asset) {
  if (
    !fs.existsSync(asset) ||
    !fs.statSync(asset).isFile() ||
    fs.statSync(asset).size === 0
  )
    throw new Error(`Updater asset not found: ${asset}`)
}

export function prepareUpdaterAssets({ installer, runtimeManifest }) {
  const primaryAssets = [
    installer,
    `${installer}.blockmap`,
    path.join(path.dirname(installer), "latest.yml"),
    runtimeManifest,
  ]
  for (const asset of primaryAssets) assertUpdaterAsset(asset)

  const legacyInstaller = path.join(
    path.dirname(installer),
    LEGACY_INSTALLER_NAME
  )
  if (path.resolve(legacyInstaller) === path.resolve(installer))
    return primaryAssets

  // Keep the previous public download URL valid while the deployed site and
  // external links transition to the Dev3 installer name.
  fs.copyFileSync(installer, legacyInstaller)
  assertUpdaterAsset(legacyInstaller)

  return [installer, legacyInstaller, ...primaryAssets.slice(1)]
}
