import path from "node:path"

const LEGACY_USER_DATA_DIRECTORY_NAME = "ai-harness"

type ElectronApplicationPaths = {
  getPath: (name: "appData") => string
  isPackaged: boolean
  setPath: (name: "userData", value: string) => void
}

export function preserveLegacyUserDataDirectory(
  electronApp: ElectronApplicationPaths
) {
  if (!electronApp.isPackaged) return

  // Installed clients must retain browser sessions and the existing Codex home.
  electronApp.setPath(
    "userData",
    path.join(electronApp.getPath("appData"), LEGACY_USER_DATA_DIRECTORY_NAME)
  )
}
