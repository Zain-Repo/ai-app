import { describe, expect, it } from "vitest"

import { decryptProviderToken, encryptProviderToken } from "./providerCrypto"

describe("provider credential encryption", () => {
  it("round-trips a token without storing it as plaintext", async () => {
    const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    const token = "sk-or-v1-test-token"
    const encrypted = await encryptProviderToken(token, key)

    expect(encrypted.ciphertext).not.toContain(token)
    await expect(
      decryptProviderToken(encrypted.ciphertext, encrypted.iv, key)
    ).resolves.toBe(token)
  })

  it("round-trips an OpenAI token with its provider context", async () => {
    const key = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8"
    const token = "sk-test-openai-token"
    const encrypted = await encryptProviderToken(token, key, "openai")

    await expect(
      decryptProviderToken(encrypted.ciphertext, encrypted.iv, key, "openai")
    ).resolves.toBe(token)
    await expect(
      decryptProviderToken(encrypted.ciphertext, encrypted.iv, key)
    ).rejects.toThrow()
  })
})
