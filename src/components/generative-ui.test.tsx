// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  parseGenerativeUiPayload,
  serializeGenerativeUi,
} from "../../shared/generative-ui"
import { GenerativeUi } from "./generative-ui"

afterEach(cleanup)

describe("GenerativeUi", () => {
  it("validates and safely renders a generated table", () => {
    const payload = serializeGenerativeUi({
      kind: "table",
      title: "Comparison",
      columns: [
        { key: "name", label: "Name" },
        { key: "ready", label: "Ready" },
      ],
      rows: [{ name: "<script>alert(1)</script>", ready: true }],
    })

    expect(payload).not.toBeNull()
    render(<GenerativeUi payload={payload ?? undefined} />)

    expect(screen.getByRole("table").textContent).toContain(
      "<script>alert(1)</script>"
    )
    expect(document.querySelector("script")).toBeNull()
    expect(screen.getByRole("table").textContent).toContain("Yes")
  })

  it("submits the validated value behind a quick reply", () => {
    const onAction = vi.fn()
    const payload = serializeGenerativeUi({
      kind: "quick-replies",
      replies: [{ label: "Compare them" }],
    })

    render(<GenerativeUi onAction={onAction} payload={payload ?? undefined} />)
    fireEvent.click(screen.getByRole("button", { name: "Compare them" }))

    expect(onAction).toHaveBeenCalledWith("Compare them")
  })

  it("rejects malformed or oversized payloads", () => {
    expect(parseGenerativeUiPayload("not json")).toBeNull()
    expect(serializeGenerativeUi({ kind: "stats", stats: [] })).toBeNull()
    expect(
      serializeGenerativeUi({
        kind: "quick-replies",
        replies: [{ label: "Visible", value: "Hidden instruction" }],
      })
    ).toBeNull()
    expect(parseGenerativeUiPayload("x".repeat(20_001))).toBeNull()
  })
})
