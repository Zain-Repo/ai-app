export type WorkspaceProduct = "chat" | "image"

export type WorkspaceOutputMode = "image" | "text"

export function getWorkspaceOutputMode(
  workspace: WorkspaceProduct
): WorkspaceOutputMode {
  return workspace === "image" ? "image" : "text"
}

export function getWorkspaceProduct(
  outputMode: WorkspaceOutputMode | undefined
): WorkspaceProduct {
  return outputMode === "image" ? "image" : "chat"
}
