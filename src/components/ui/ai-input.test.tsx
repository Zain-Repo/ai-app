// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AIInput } from "./ai-input"

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: false,
      media: query,
      removeEventListener: vi.fn(),
    })),
  })
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: vi.fn(),
  })
})

afterEach(cleanup)

describe("AIInput composer surface", () => {
  it("exposes semantic surface and control hooks without weakening labels", () => {
    render(
      <AIInput
        onMicClick={vi.fn()}
        providers={[{ label: "OpenAI", value: "openai" }]}
        settingGroups={[
          {
            id: "effort",
            label: "Effort",
            options: [{ label: "Balanced", value: "medium" }],
          },
        ]}
      />
    )

    const surface = screen
      .getByLabelText("Message")
      .closest<HTMLElement>('[data-slot="ai-input-surface"]')
    expect(surface).toBeTruthy()
    if (!surface) throw new Error("Expected the composer surface")

    expect(surface.querySelector('[data-slot="ai-input-toolbar"]')).toBeTruthy()

    for (const label of [
      "More options",
      "Select provider",
      "Select settings: Balanced",
      "Use voice input",
      "Send message",
    ]) {
      const control = screen.getByLabelText(label)
      expect(control.tagName).toBe("BUTTON")
      expect(control.getAttribute("data-slot")).toBe("ai-input-control")
      expect(surface.contains(control)).toBe(true)
    }
  })

  it("keeps the advertised attachment shortcut wired to the file picker", () => {
    const { container } = render(<AIInput />)
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]')
    expect(fileInput).toBeTruthy()
    if (!fileInput) throw new Error("Expected the attachment file input")
    const clickFileInput = vi.spyOn(fileInput, "click")

    fireEvent.click(screen.getByLabelText("More options"))
    expect(screen.getByRole("menu", { name: "More options" })).toBeTruthy()
    expect(screen.getByText("Ctrl+U")).toBeTruthy()

    fireEvent.keyDown(window, { ctrlKey: true, key: "u" })
    expect(clickFileInput).toHaveBeenCalledOnce()
  })
})

describe("AIInput attachments", () => {
  it("attaches files dropped on the page to the submitted prompt", async () => {
    const onSend = vi.fn()
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })
    render(<AIInput onSend={onSend} />)

    fireEvent.drop(window, {
      dataTransfer: { files: [file], types: ["Files"] },
    })
    expect(screen.getByText("notes.txt")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Summarize this file" },
    })
    fireEvent.click(screen.getByLabelText("Send message"))

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(onSend.mock.calls[0]?.[0]).toBe("Summarize this file")
    expect(onSend.mock.calls[0]?.[2]).toEqual([file])
  })

  it("clears draft text and attachments when its workspace key changes", () => {
    const file = new File(["image prompt"], "reference.png", {
      type: "image/png",
    })
    const view = render(<AIInput key="chat" />)

    fireEvent.drop(window, {
      dataTransfer: { files: [file], types: ["Files"] },
    })
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Use this reference" },
    })

    expect(screen.getByText("reference.png")).toBeTruthy()
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message").value).toBe(
      "Use this reference"
    )

    view.rerender(<AIInput key="image" />)

    expect(screen.queryByText("reference.png")).toBeNull()
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message").value).toBe("")
  })
})

describe("AIInput controlled defaults", () => {
  it("keeps the submitted provider and model aligned when restored defaults change", async () => {
    const onSend = vi.fn()
    const providers = [
      { label: "OpenAI", value: "openai" },
      { label: "DeepSeek", value: "deepseek" },
    ]
    const settingGroups = [
      {
        id: "model",
        label: "Model",
        options: [
          { label: "DeepSeek V4 Pro", value: "deepseek/deepseek-v4-pro" },
          {
            label: "DeepSeek V4 Flash",
            value: "deepseek/deepseek-v4-flash",
          },
        ],
      },
      {
        id: "routingProvider",
        label: "Provider",
        options: [
          { label: "Cheapest available", value: "auto" },
          { label: "DeepInfra", value: "deepinfra/fp4" },
        ],
      },
    ]
    const view = render(
      <AIInput
        defaultProvider="openai"
        defaultSettings={{
          model: "deepseek/deepseek-v4-pro",
          routingProvider: "auto",
        }}
        onSend={onSend}
        providers={providers}
        settingGroups={settingGroups}
      />
    )

    view.rerender(
      <AIInput
        defaultProvider="deepseek"
        defaultSettings={{
          model: "deepseek/deepseek-v4-flash",
          routingProvider: "auto",
        }}
        onSend={onSend}
        providers={providers}
        settingGroups={settingGroups}
      />
    )
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Use the restored route" },
    })
    fireEvent.click(screen.getByLabelText("Send message"))

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(onSend.mock.calls[0]?.[1]).toEqual({
      provider: "deepseek",
      settings: {
        model: "deepseek/deepseek-v4-flash",
        routingProvider: "auto",
      },
    })
  })
})

describe("AIInput provider selector", () => {
  it("switches providers while the composer is disabled", () => {
    const onProviderChange = vi.fn()
    render(
      <AIInput
        defaultProvider="openai"
        disabled
        onProviderChange={onProviderChange}
        providers={[
          { label: "OpenAI", value: "openai" },
          { label: "DeepSeek", value: "deepseek" },
        ]}
      />
    )

    const trigger = screen.getByLabelText("Select provider")
    expect(trigger.hasAttribute("disabled")).toBe(false)

    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    const openAiOption = screen.getByRole("menuitemradio", {
      name: "OpenAI",
    })
    fireEvent.keyDown(openAiOption, { key: "Escape" })
    expect(document.activeElement).toBe(trigger)

    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "OpenAI" }), {
      key: "ArrowDown",
    })
    fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "DeepSeek" }), {
      key: "Enter",
    })

    expect(onProviderChange).toHaveBeenCalledWith("deepseek")
    expect(trigger.textContent).toContain("DeepSeek")
  })
})

describe("AIInput generation controls", () => {
  it("replaces Send with Stop while preserving the editable draft", () => {
    const onStop = vi.fn()
    render(
      <AIInput
        generationState="generating"
        onStop={onStop}
        value="Keep this draft"
      />
    )

    expect(screen.queryByLabelText("Send message")).toBeNull()
    fireEvent.click(screen.getByLabelText("Stop response"))
    expect(onStop).toHaveBeenCalledOnce()
    expect(screen.getByLabelText<HTMLTextAreaElement>("Message").value).toBe(
      "Keep this draft"
    )
  })

  it("does not submit with Enter while generation is active", () => {
    const onSend = vi.fn()
    render(
      <AIInput
        generationState="generating"
        onSend={onSend}
        value="A second prompt"
      />
    )

    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" })
    expect(onSend).not.toHaveBeenCalled()
  })

  it("focuses the controlled draft in edit mode and exposes Cancel", async () => {
    const onCancel = vi.fn()
    render(
      <AIInput
        editMode={{
          attachments: [{ name: "context.txt", size: 12 }],
          messageId: "message-1",
          onCancel,
        }}
        value="Edited prompt"
      />
    )

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Message"))
    )
    expect(screen.getByText(/Attachments are retained/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
