export type DesktopCodexAccount = {
  connected: boolean
  email: string | null
  planType: string | null
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

export type DesktopCodexGenerateResult = {
  content: string
  reasoningSteps: string[]
}

export type DesktopUpdaterState = {
  availableVersion: string | null
  currentVersion: string
  error: string | null
  progress: number | null
  status:
    | "checking"
    | "disabled"
    | "downloading"
    | "error"
    | "idle"
    | "ready"
    | "up-to-date"
}

export type AiHarnessDesktopApi = {
  codex: {
    account: () => Promise<DesktopCodexAccount>
    generate: (
      input: DesktopCodexGenerateInput
    ) => Promise<DesktopCodexGenerateResult>
    listModels: () => Promise<DesktopCodexModel[]>
    login: () => Promise<DesktopCodexAccount>
    logout: () => Promise<void>
  }
  isDesktop: true
  updater: {
    check: () => Promise<DesktopUpdaterState>
    download: () => Promise<DesktopUpdaterState>
    getState: () => Promise<DesktopUpdaterState>
    install: () => Promise<void>
    onState: (callback: (state: DesktopUpdaterState) => void) => () => void
  }
  version: () => Promise<string>
}

declare global {
  interface Window {
    aiHarnessDesktop?: AiHarnessDesktopApi
  }
}
