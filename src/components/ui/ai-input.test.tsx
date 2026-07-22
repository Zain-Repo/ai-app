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
  it("keeps the submitted agent and model aligned when restored defaults change", async () => {
    const onSend = vi.fn()
    const agents = [
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
        agents={agents}
        defaultAgent="openai"
        defaultSettings={{
          model: "deepseek/deepseek-v4-pro",
          routingProvider: "auto",
        }}
        onSend={onSend}
        settingGroups={settingGroups}
      />
    )

    view.rerender(
      <AIInput
        agents={agents}
        defaultAgent="deepseek"
        defaultSettings={{
          model: "deepseek/deepseek-v4-flash",
          routingProvider: "auto",
        }}
        onSend={onSend}
        settingGroups={settingGroups}
      />
    )
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Use the restored route" },
    })
    fireEvent.click(screen.getByLabelText("Send message"))

    await waitFor(() => expect(onSend).toHaveBeenCalledOnce())
    expect(onSend.mock.calls[0]?.[1]).toEqual({
      agent: "deepseek",
      settings: {
        model: "deepseek/deepseek-v4-flash",
        routingProvider: "auto",
      },
    })
  })
})
