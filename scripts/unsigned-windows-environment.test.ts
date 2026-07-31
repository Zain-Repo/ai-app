import { describe, expect, it } from "vitest"

import { unsignedWindowsEnvironment } from "./unsigned-windows-environment.mjs"

describe("unsigned Windows environment", () => {
  it("removes signing credentials and disables certificate discovery", () => {
    expect(
      unsignedWindowsEnvironment({
        CSC_IDENTITY_AUTO_DISCOVERY: "true",
        CSC_KEY_PASSWORD: "secret",
        CSC_LINK: "certificate",
        KEEP_ME: "value",
        WIN_CSC_KEY_PASSWORD: "secret",
        WIN_CSC_LINK: "certificate",
      })
    ).toEqual({
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      KEEP_ME: "value",
    })
  })
})
