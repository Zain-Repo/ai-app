// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { UserPreferencesDialog } from "./user-preferences-dialog"

type SavedPreferences = {
  defaultModel: string | null
  intelligenceLevel: "adaptive" | "quick" | "balanced" | "deep"
  language: "auto" | "en" | "fr" | "es"
  responseDetail: "concise" | "balanced" | "detailed"
  userMessageBubbleColor:
    "default" | "sky" | "violet" | "rose" | "emerald" | "amber" | "slate"
}

const savedPreferences: SavedPreferences = {
  defaultModel: null,
  intelligenceLevel: "adaptive",
  language: "auto",
  responseDetail: "balanced",
  userMessageBubbleColor: "default",
}

const updatePreferences =
  vi.fn<(preferences: SavedPreferences) => Promise<null>>()

vi.mock("convex/react", () => ({
  useMutation: () => updatePreferences,
  useQuery: () => savedPreferences,
}))

beforeEach(() => {
  updatePreferences.mockReset()
  updatePreferences.mockResolvedValue(null)
})

afterEach(cleanup)

describe("UserPreferencesDialog", () => {
  it("saves the selected message color with every preference", async () => {
    render(
      <UserPreferencesDialog
        models={[{ label: "GPT-5", value: "openai/gpt-5" }]}
        open
      />
    )

    await waitFor(() =>
      expect(screen.getByRole("radio", { name: "Violet" })).toBeTruthy()
    )

    fireEvent.change(screen.getByLabelText("Default model"), {
      target: { value: "openai/gpt-5" },
    })
    fireEvent.change(screen.getByLabelText("Language"), {
      target: { value: "fr" },
    })
    fireEvent.change(screen.getByLabelText("Default intelligence"), {
      target: { value: "deep" },
    })
    fireEvent.change(screen.getByLabelText("Response detail"), {
      target: { value: "detailed" },
    })
    const violet = screen.getByRole("radio", { name: "Violet" })
    fireEvent.click(violet)
    expect((violet as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole("button", { name: "Save preferences" }))

    await waitFor(() =>
      expect(updatePreferences).toHaveBeenCalledWith({
        defaultModel: "openai/gpt-5",
        intelligenceLevel: "deep",
        language: "fr",
        responseDetail: "detailed",
        userMessageBubbleColor: "violet",
      })
    )
  })
})
