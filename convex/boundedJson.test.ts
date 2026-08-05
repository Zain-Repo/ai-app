import { describe, expect, it } from "vitest"

import { readBoundedJson } from "./boundedJson"

describe("readBoundedJson", () => {
  it("parses a response within the configured byte limit", async () => {
    await expect(
      readBoundedJson(Response.json({ ok: true }), 100, "invalid response")
    ).resolves.toEqual({ ok: true })
  })

  it("rejects declared and streamed responses over the byte limit", async () => {
    await expect(
      readBoundedJson(
        new Response("{}", { headers: { "content-length": "101" } }),
        100,
        "invalid response"
      )
    ).rejects.toThrow("invalid response")
    await expect(
      readBoundedJson(
        new Response('{"large":"payload"}'),
        5,
        "invalid response"
      )
    ).rejects.toThrow("invalid response")
  })
})
