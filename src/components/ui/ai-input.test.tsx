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
})

afterEach(cleanup)

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
