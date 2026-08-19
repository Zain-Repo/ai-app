export type DesktopCodexAccount = {
  connected: boolean
  email: string | null
  planType: string | null
}

export type DesktopCursorAccount = {
  connected: boolean
}

export type DesktopCodexModel = {
  defaultReasoningEffort?: string
  description?: string
  label: string
  reasoningEfforts?: string[]
  value: string
}

export type DesktopCodexMessage = {
  content: string
  role: "assistant" | "system" | "user"
}

export type DesktopCodexGenerateInput = {
  developerInstructions?: string
  effort?: string
  messages: DesktopCodexMessage[]
  model: string
}

export type DesktopCodexMessagePhase = "commentary" | "final_answer"

export type DesktopCodexDelta = {
  delta: string
  itemId: string
  phase: DesktopCodexMessagePhase | null
}

export type DesktopCodexGenerateResult = {
  content: string
  interrupted?: boolean
  reasoningSteps: string[]
}

export type DesktopUpdaterState = {
  availableVersion: string | null
  codex: {
    currentVersion: string | null
    error: string | null
    includedVersion: string | null
  }
  currentVersion: string
  error: string | null
  progress: number | null
  status:
    | "checking"
    | "disabled"
    | "downloading"
    | "error"
    | "idle"
    | "installing"
    | "ready-to-install"
    | "store-managed"
    | "update-available"
    | "up-to-date"
}

export type Dev3DesktopApi = {
  codex: {
    account: () => Promise<DesktopCodexAccount>
    cancel?: (requestId: string) => Promise<boolean>
    generate: (
      input: DesktopCodexGenerateInput,
      onDelta?: (delta: DesktopCodexDelta) => void,
      requestId?: string
    ) => Promise<DesktopCodexGenerateResult>
    listModels: () => Promise<DesktopCodexModel[]>
    login: () => Promise<DesktopCodexAccount>
    logout: () => Promise<void>
  }
  cursor: {
    account: () => Promise<DesktopCursorAccount>
    login: () => Promise<DesktopCursorAccount>
    logout: () => Promise<void>
  }
  isDesktop: true
  updater: {
    check: () => Promise<DesktopUpdaterState>
    download: () => Promise<DesktopUpdaterState>
    getState: () => Promise<DesktopUpdaterState>
    install: () => Promise<DesktopUpdaterState>
    onState: (callback: (state: DesktopUpdaterState) => void) => () => void
  }
  version: () => Promise<string>
}

declare global {
  interface Window {
    /** Compatibility bridge for desktop clients released before Dev3 0.1.12. */
    aiHarnessDesktop?: Dev3DesktopApi
    dev3Desktop?: Dev3DesktopApi
  }
}
