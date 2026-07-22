function providerContext(provider: string) {
  return new TextEncoder().encode(
    provider === "openrouter" ? "openrouter" : `provider:${provider}`
  )
}

function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid provider encryption key")
  }

  const base64 = value.replace(/-/g, "+").replace(/_/g, "/")
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

async function importEncryptionKey(encodedKey: string) {
  const key = decodeBase64Url(encodedKey)
  if (key.byteLength !== 32) {
    throw new Error("Provider encryption key must be 32 bytes")
  }

  return await crypto.subtle.importKey("raw", key, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

export async function encryptProviderToken(
  token: string,
  encodedKey: string,
  provider = "openrouter"
) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: providerContext(provider) },
    await importEncryptionKey(encodedKey),
    new TextEncoder().encode(token)
  )

  return {
    ciphertext: encodeBase64Url(ciphertext),
    iv: encodeBase64Url(iv),
  }
}

export async function decryptProviderToken(
  ciphertext: string,
  iv: string,
  encodedKey: string,
  provider = "openrouter"
) {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: decodeBase64Url(iv),
      additionalData: providerContext(provider),
    },
    await importEncryptionKey(encodedKey),
    decodeBase64Url(ciphertext)
  )

  return new TextDecoder().decode(plaintext)
}
