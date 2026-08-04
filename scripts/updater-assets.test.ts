import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it } from "vitest"

// @ts-expect-error Runtime release asset preparation is JavaScript for Node.js.
import * as updaterAssets from "./updater-assets.mjs"

const { LEGACY_INSTALLER_NAME, prepareUpdaterAssets } = updaterAssets
const temporaryDirectories: string[] = []

function createAssetDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dev3-assets-"))
  temporaryDirectories.push(directory)

  const installer = path.join(directory, "dev3-setup.exe")
  const runtimeManifest = path.join(directory, "codex-runtime.json")
  fs.writeFileSync(installer, "current installer")
  fs.writeFileSync(`${installer}.blockmap`, "blockmap")
  fs.writeFileSync(path.join(directory, "latest.yml"), "release metadata")
  fs.writeFileSync(runtimeManifest, "runtime metadata")

  return { directory, installer, runtimeManifest }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { force: true, recursive: true })
})

describe("updater release assets", () => {
  it("publishes an identical legacy installer alias", () => {
    const { directory, installer, runtimeManifest } = createAssetDirectory()

    const assets = prepareUpdaterAssets({ installer, runtimeManifest })

    expect(assets.map((asset: string) => path.basename(asset))).toEqual([
      "dev3-setup.exe",
      LEGACY_INSTALLER_NAME,
      "dev3-setup.exe.blockmap",
      "latest.yml",
      "codex-runtime.json",
    ])
    expect(
      fs.readFileSync(path.join(directory, LEGACY_INSTALLER_NAME), "utf8")
    ).toBe("current installer")
  })

  it("refuses to prepare an incomplete updater release", () => {
    const { installer, runtimeManifest } = createAssetDirectory()
    fs.rmSync(`${installer}.blockmap`)

    expect(() => prepareUpdaterAssets({ installer, runtimeManifest })).toThrow(
      "Updater asset not found"
    )
  })
})
