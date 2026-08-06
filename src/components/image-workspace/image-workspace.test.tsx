// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
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

    expect(
      (await screen.findAllByText("Image settings")).length
    ).toBeGreaterThan(0)
  })
})
