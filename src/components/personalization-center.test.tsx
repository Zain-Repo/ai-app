// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { getFunctionName } from "convex/server"
import type { FunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PersonalizationCenter } from "./personalization-center"

const calls = vi.hoisted(() => ({
  confirm: vi.fn(),
  clear: vi.fn(),
  clearHistory: vi.fn(),
  create: vi.fn(),
  remove: vi.fn(),
  retryProcessing: vi.fn(),
  setEnabled: vi.fn(),
  setHistory: vi.fn(),
  setPinned: vi.fn(),
  setProfile: vi.fn(),
  undo: vi.fn(),
  update: vi.fn(),
  updatePreferences: vi.fn(),
}))

const memoryId = "memory-1" as never
const legacyMemoryId = "legacy-memory-1" as never
const connectionId = "connection-1" as never
const preferencesFixture = {
  defaultModel: "gpt-5",
  intelligenceLevel: "deep" as const,
  language: "en" as const,
  responseDetail: "detailed" as const,
  userMessageBubbleColor: "sky" as const,
}
const connectionsFixture = [
  {
    authMethod: "api_key",
    connectionId,
    provider: "openai",
    status: "connected",
  },
]
const personalizationFixture = {
  capacity: { active: 1, limit: 100 },
  degradedReason: "processing_unavailable" as const,
  failedJobs: 1,
  historyEnabled: false,
  items: [
    {
      _id: memoryId,
      canonicalKey: "preferences.style",
      category: "preference" as const,
      confirmation: "pending" as const,
      content: "Prefer concise answers",
      pinned: false,
      projectName: "Memory v2",
      scope: "user" as const,
      sensitivity: "sensitive" as const,
      sourceConversationTitle: "Memory architecture",
      sourceSignal: "direct_statement" as const,
      sourceTimestamp: Date.UTC(2026, 0, 2),
      expiresAt: Date.UTC(2026, 1, 2),
      lastUsedAt: Date.UTC(2026, 0, 5),
      status: "needs_review" as const,
    },
  ],
  legacyMemories: [
    {
      _id: legacyMemoryId,
      content: "Keep project examples concise",
      key: "preferences.examples",
      scope: "user" as const,
      updatedAt: Date.UTC(2026, 0, 6),
    },
  ],
  pendingJobs: 2,
  processing: null,
  savedMemoryEnabled: true,
}

vi.mock("convex/react", () => ({
  useMutation: (reference: FunctionReference<"mutation">) => {
    switch (getFunctionName(reference)) {
      case "memories:clear":
        return calls.clear
      case "memories:clearHistoryMemory":
        return calls.clearHistory
      case "memories:confirm":
        return calls.confirm
      case "memories:create":
        return calls.create
      case "memories:remove":
        return calls.remove
      case "memories:retryProcessing":
        return calls.retryProcessing
      case "memories:setEnabled":
        return calls.setEnabled
      case "memories:setHistoryEnabled":
        return calls.setHistory
      case "memories:setPinned":
        return calls.setPinned
      case "memories:setProcessingProfile":
        return calls.setProfile
      case "memories:undoRemove":
        return calls.undo
      case "memories:update":
        return calls.update
      case "users:updatePreferences":
        return calls.updatePreferences
      default:
        throw new Error(
          `Unexpected mutation reference: ${getFunctionName(reference)}`
        )
    }
  },
  useQuery: (reference: FunctionReference<"query">) => {
    switch (getFunctionName(reference)) {
      case "memories:getPersonalization":
        return personalizationFixture
      case "providerConnections:listMine":
        return connectionsFixture
      case "users:getPreferences":
        return preferencesFixture
      default:
        throw new Error(
          `Unexpected query reference: ${getFunctionName(reference)}`
        )
    }
  },
}))

beforeEach(() => {
  for (const call of Object.values(calls))
    if (typeof call === "function") call.mockReset().mockResolvedValue(null)
  personalizationFixture.savedMemoryEnabled = true
  vi.spyOn(window, "confirm").mockReturnValue(true)
})

afterEach(cleanup)

describe("PersonalizationCenter", () => {
  it("initializes controlled defaults and manages memory, history, and processing", async () => {
    render(
      <PersonalizationCenter
        models={[{ label: "GPT 5", value: "gpt-5" }]}
        onOpenChange={vi.fn()}
        open
      />
    )
    expect(screen.getByRole("tab", { name: "Defaults" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Saved memory" })).toBeTruthy()
    expect(screen.getByLabelText("Language")).toHaveProperty("value", "en")
    expect(screen.getByRole("radio", { name: "Sky" })).toHaveProperty(
      "checked",
      true
    )
    fireEvent.click(screen.getByRole("radio", { name: "Violet" }))
    fireEvent.click(screen.getByRole("button", { name: "Save defaults" }))
    await waitFor(() =>
      expect(calls.updatePreferences).toHaveBeenCalledWith(
        expect.objectContaining({
          language: "en",
          responseDetail: "detailed",
          userMessageBubbleColor: "violet",
        })
      )
    )

    fireEvent.click(screen.getByRole("tab", { name: "Saved memory" }))
    expect(
      screen.getByRole("switch", { name: "Save and use memories" })
    ).toHaveProperty("ariaChecked", "true")
    const provenance = screen.getByLabelText(
      "Memory provenance for preferences.style"
    ).textContent
    expect(provenance).toContain("Saved")
    expect(provenance).toContain("Project: Memory v2")
    expect(provenance).toContain("From: Memory architecture")
    expect(provenance).toContain("Last used")
    expect(provenance).toContain("Review needed")
    expect(provenance).toContain("Expired")
    fireEvent.change(screen.getByLabelText("Memory key"), {
      target: { value: "profile.name" },
    })
    fireEvent.change(screen.getByLabelText("Memory content"), {
      target: { value: "Ada" },
    })
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /explicitly want to save this/i,
      })
    )
    fireEvent.click(screen.getByRole("button", { name: "Add" }))
    await waitFor(() =>
      expect(calls.create).toHaveBeenCalledWith({
        canonicalKey: "profile.name",
        category: "fact",
        confirmSensitive: true,
        content: "Ada",
        scope: "user",
      })
    )
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }))
    fireEvent.click(screen.getByRole("button", { name: "Pin" }))
    fireEvent.click(screen.getByRole("button", { name: "Delete" }))
    await waitFor(() =>
      expect(calls.confirm).toHaveBeenCalledWith({
        confirmSensitive: true,
        memoryItemId: memoryId,
      })
    )
    expect(window.confirm).toHaveBeenCalledWith(
      "This is sensitive personal information. Confirm that you want to save it?"
    )
    expect(calls.setPinned).toHaveBeenCalledWith({
      memoryItemId: memoryId,
      pinned: true,
    })
    expect(calls.remove).toHaveBeenCalledWith({ memoryItemId: memoryId })
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Undo removal" })).toBeTruthy()
    )
    fireEvent.click(screen.getByRole("button", { name: "Undo removal" }))
    await waitFor(() =>
      expect(calls.undo).toHaveBeenCalledWith({ memoryItemId: memoryId })
    )
    expect(
      screen.getByRole("heading", { name: "Legacy memories" })
    ).toBeTruthy()
    fireEvent.click(
      screen.getByRole("button", {
        name: "Edit legacy memory preferences.examples",
      })
    )
    const legacyEditor = screen.getByRole("textbox", {
      name: "Edit legacy memory preferences.examples",
    })
    fireEvent.change(legacyEditor, {
      target: { value: "Keep examples short" },
    })
    fireEvent.blur(legacyEditor)
    await waitFor(() =>
      expect(calls.update).toHaveBeenCalledWith({
        content: "Keep examples short",
        memoryId: legacyMemoryId,
      })
    )
    fireEvent.click(
      screen.getByRole("button", {
        name: "Delete legacy memory preferences.examples",
      })
    )
    await waitFor(() =>
      expect(calls.remove).toHaveBeenCalledWith({ memoryId: legacyMemoryId })
    )

    fireEvent.click(screen.getByRole("tab", { name: "History" }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Use chat history/ }))
    await waitFor(() =>
      expect(calls.setHistory).toHaveBeenCalledWith({ enabled: true })
    )
    fireEvent.click(
      screen.getByRole("button", { name: "Clear history memory" })
    )
    await waitFor(() => expect(calls.clearHistory).toHaveBeenCalledWith({}))
    expect(window.confirm).toHaveBeenCalledWith(
      "Clear all chat-history memory? This does not remove your saved memories."
    )
    fireEvent.click(screen.getByRole("tab", { name: "Processing" }))
    expect(screen.getByText(/processing unavailable/i)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Memory processing provider"), {
      target: { value: connectionId },
    })
    await waitFor(() =>
      expect(calls.setProfile).toHaveBeenCalledWith({
        providerConnectionId: connectionId,
      })
    )
    fireEvent.click(screen.getByRole("button", { name: "Retry failed jobs" }))
    await waitFor(() => expect(calls.retryProcessing).toHaveBeenCalledWith({}))
  })

  it("confirms clearing every saved memory and restores focus after cancellation", async () => {
    render(
      <PersonalizationCenter
        models={[{ label: "GPT 5", value: "gpt-5" }]}
        onOpenChange={vi.fn()}
        open
      />
    )

    fireEvent.click(screen.getByRole("tab", { name: "Saved memory" }))
    const clearSavedMemoryButton = screen.getByRole("button", {
      name: "Clear all saved memories",
    })
    clearSavedMemoryButton.focus()
    expect(document.activeElement).toBe(clearSavedMemoryButton)
    fireEvent.click(clearSavedMemoryButton)
    const confirmation = await screen.findByRole("alertdialog")
    expect(
      within(confirmation).getByRole("heading", {
        name: "Clear all saved memories?",
      })
    ).toBeTruthy()
    fireEvent.click(within(confirmation).getByRole("button", { name: "Cancel" }))
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).toBeNull()
    )
    expect(document.activeElement).toBe(clearSavedMemoryButton)

    fireEvent.click(clearSavedMemoryButton)
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "Clear saved memories",
      })
    )
    await waitFor(() => expect(calls.clear).toHaveBeenCalledWith({}))
    expect(screen.getByRole("status").textContent).toContain(
      "Saved memories cleared"
    )
  })

  it("lets an opted-out user enable saved memory while keeping legacy rows manageable", async () => {
    personalizationFixture.savedMemoryEnabled = false
    render(
      <PersonalizationCenter
        models={[{ label: "GPT 5", value: "gpt-5" }]}
        onOpenChange={vi.fn()}
        open
      />
    )

    fireEvent.click(screen.getByRole("tab", { name: "Saved memory" }))
    const savedMemorySwitch = screen.getByRole("switch", {
      name: "Save and use memories",
    })
    expect(savedMemorySwitch).toHaveProperty("ariaChecked", "false")
    expect(
      screen.getByText(/Saved memory is off\. You can still review/i)
    ).toBeTruthy()
    expect(
      screen.getByText("Keep project examples concise")
    ).toBeTruthy()

    fireEvent.click(savedMemorySwitch)
    await waitFor(() =>
      expect(calls.setEnabled).toHaveBeenCalledWith({ enabled: true })
    )
  })
})
