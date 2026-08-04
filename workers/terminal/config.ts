export const DEFAULT_TERMINAL_SANDBOX_IMAGE = "ai-harness-terminal:local"

export function resolveTerminalSandboxImage(configuredImage?: string) {
  // Keep pre-rebrand worker hosts operational until their image is retagged.
  return configuredImage?.trim() || DEFAULT_TERMINAL_SANDBOX_IMAGE
}
