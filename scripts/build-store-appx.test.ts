import { describe, expect, it } from "vitest"

// @ts-expect-error Runtime Store builder is JavaScript for electron-builder.
import * as storeAppx from "./build-store-appx.mjs"

const { storeBuilderConfig, storeBuilderEnvironment, storeIdentity } = storeAppx

const identityEnvironment = {
  MICROSOFT_STORE_IDENTITY_NAME: "12345AIHarness",
  MICROSOFT_STORE_PUBLISHER: "CN=12345678-1234-1234-1234-123456789012",
  MICROSOFT_STORE_PUBLISHER_DISPLAY_NAME: "A2Z Software",
}

describe("Microsoft Store AppX configuration", () => {
  it("requires Partner Center identity and disables local signing", () => {
    expect(() => storeIdentity({})).toThrow("MICROSOFT_STORE_IDENTITY_NAME")
    const identity = storeIdentity(identityEnvironment)
    expect(identity.applicationId).toBe("AIHarness")

    const config = storeBuilderConfig(
      {
        directories: { output: "out/nsis" },
        publish: [{ provider: "github" }],
        win: { target: "nsis" },
      },
      "0.1.8",
      identity
    )
    expect(config).toMatchObject({
      appx: identity,
      directories: { output: "out/store" },
      forceCodeSigning: false,
      publish: [],
      win: { target: [{ arch: ["x64"], target: "appx" }] },
    })
  })

  it("does not pass certificate material to electron-builder", () => {
    const env = storeBuilderEnvironment({
      CSC_LINK: "secret-certificate",
      WIN_CSC_KEY_PASSWORD: "secret-password",
    })
    expect(env.CSC_IDENTITY_AUTO_DISCOVERY).toBe("false")
    expect(env.CSC_LINK).toBeUndefined()
    expect(env.WIN_CSC_KEY_PASSWORD).toBeUndefined()
  })
})
