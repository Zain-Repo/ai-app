// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { ReferenceStrip } from "./reference-strip"

afterEach(cleanup)

describe("ReferenceStrip", () => {
  it("accepts supported images from the compact composer control", () => {
    const onChange = vi.fn()

    render(
      <ReferenceStrip compact limit={4} onChange={onChange} references={[]} />
    )

    const file = new File(["image"], "reference.png", {
      type: "image/png",
    })
    fireEvent.change(screen.getByLabelText("Add reference images"), {
      target: { files: [file] },
    })

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ file, id: expect.any(String) }),
    ])
  })
})
