// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getDefaultImageGenerationConfig,
  getStaticImageModelCapability,
} from "../../../shared/image-generation"
import { ImageSettings } from "./image-settings"

afterEach(cleanup)

describe("ImageSettings", () => {
  it("renders and emits only choices supported by the active model", () => {
    const capability = getStaticImageModelCapability(
      "fal",
      "fal-ai/nano-banana-2"
    )
    if (!capability) throw new Error("Missing image capability fixture")
    const onChange = vi.fn()

    render(
      <ImageSettings
        capability={capability}
        config={getDefaultImageGenerationConfig(capability)}
        onChange={onChange}
        section="primary"
      />
    )

    fireEvent.change(screen.getByLabelText("Aspect ratio"), {
      target: { value: "16:9" },
    })
    expect(onChange).toHaveBeenCalledWith({ dimension: "16:9" })

    fireEvent.click(screen.getByRole("radio", { name: "4" }))
    expect(onChange).toHaveBeenCalledWith({ count: 4 })
    expect(screen.getByLabelText("Resolution")).toBeTruthy()
  })
})
