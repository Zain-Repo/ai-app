// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type * as ConvexReact from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getStaticImageModelCapability } from "../../../shared/image-generation"
import { ImageWorkspace } from "./image-workspace"

const { cancelGenerationMock, loadCapabilityMock } = vi.hoisted(() => ({
  cancelGenerationMock: vi.fn(),
  loadCapabilityMock: vi.fn(),
}))

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useAction: () => loadCapabilityMock,
  useMutation: () => cancelGenerationMock,
  useQuery: () => undefined,
}))

beforeEach(() => {
  cancelGenerationMock.mockReset()
  loadCapabilityMock.mockReset()
})

afterEach(cleanup)

describe("ImageWorkspace", () => {
  it("waits for draft defaults before rendering model settings", async () => {
    const capability = getStaticImageModelCapability(
      "fal",
      "fal-ai/nano-banana-2"
    )
    if (!capability) throw new Error("Missing image capability fixture")
    loadCapabilityMock.mockResolvedValue(capability)

    render(
      <ImageWorkspace
        generationState="idle"
        modelId={capability.modelId}
        models={[{ label: "Nano Banana 2", value: capability.modelId }]}
        onConnectProvider={vi.fn()}
        onGenerate={vi.fn().mockResolvedValue(undefined)}
        onModelChange={vi.fn()}
        onProviderChange={vi.fn()}
        onRoutingProviderChange={vi.fn()}
        provider="fal"
        providers={[{ label: "fal", value: "fal" }]}
        routingOptions={[]}
      />
    )

    const settingsButton = screen.getByRole("button", {
      name: "Settings",
    })
    await waitFor(() =>
      expect(settingsButton.hasAttribute("disabled")).toBe(false)
    )

    fireEvent.click(settingsButton)
    expect(await screen.findByText("Aspect ratio")).toBeTruthy()
  })

  it("moves an inspiration prompt into the composer", async () => {
    const capability = getStaticImageModelCapability(
      "fal",
      "fal-ai/nano-banana-2"
    )
    if (!capability) throw new Error("Missing image capability fixture")
    loadCapabilityMock.mockResolvedValue(capability)

    render(
      <ImageWorkspace
        generationState="idle"
        modelId={capability.modelId}
        models={[{ label: "Nano Banana 2", value: capability.modelId }]}
        onConnectProvider={vi.fn()}
        onGenerate={vi.fn().mockResolvedValue(undefined)}
        onModelChange={vi.fn()}
        onProviderChange={vi.fn()}
        onRoutingProviderChange={vi.fn()}
        provider="fal"
        providers={[{ label: "fal", value: "fal" }]}
        routingOptions={[]}
      />
    )

    fireEvent.click(
      screen.getByRole("button", { name: "Use an example prompt" })
    )

    expect(
      screen.getByRole("textbox", {
        name: "Image prompt",
      })
    ).toHaveProperty("value", expect.stringContaining("refined product scene"))
  })

  it("preserves the keyboard generation shortcut", async () => {
    const capability = getStaticImageModelCapability(
      "fal",
      "fal-ai/nano-banana-2"
    )
    if (!capability) throw new Error("Missing image capability fixture")
    loadCapabilityMock.mockResolvedValue(capability)
    const onGenerate = vi.fn().mockResolvedValue(undefined)

    render(
      <ImageWorkspace
        generationState="idle"
        modelId={capability.modelId}
        models={[{ label: "Nano Banana 2", value: capability.modelId }]}
        onConnectProvider={vi.fn()}
        onGenerate={onGenerate}
        onModelChange={vi.fn()}
        onProviderChange={vi.fn()}
        onRoutingProviderChange={vi.fn()}
        provider="fal"
        providers={[{ label: "fal", value: "fal" }]}
        routingOptions={[]}
      />
    )

    const prompt = screen.getByRole("textbox", { name: "Image prompt" })
    fireEvent.change(prompt, { target: { value: "A quiet mountain cabin" } })
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Generate" })
          .hasAttribute("disabled")
      ).toBe(false)
    )
    fireEvent.keyDown(prompt, { ctrlKey: true, key: "Enter" })

    await waitFor(() =>
      expect(onGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          capability,
          files: [],
          prompt: "A quiet mountain cabin",
        })
      )
    )
  })
})
