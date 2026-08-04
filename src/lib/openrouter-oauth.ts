export const OPENROUTER_PKCE_STORAGE_KEY = "dev3:openrouter-pkce"
const LEGACY_OPENROUTER_PKCE_STORAGE_KEY = "ai-harness:openrouter-pkce"

type PkceStorage = Pick<Storage, "getItem" | "removeItem">

export function takeOpenRouterPkceVerifier(storage: PkceStorage) {
  const verifier =
    storage.getItem(OPENROUTER_PKCE_STORAGE_KEY) ||
    storage.getItem(LEGACY_OPENROUTER_PKCE_STORAGE_KEY)

  storage.removeItem(OPENROUTER_PKCE_STORAGE_KEY)
  storage.removeItem(LEGACY_OPENROUTER_PKCE_STORAGE_KEY)
  return verifier
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export async function createOpenRouterAuthorization(origin: string) {
  const verifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = encodeBase64Url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))
  )
  const callbackUrl = new URL("/provider-callback/openrouter", origin)
  const authorizationUrl = new URL("https://openrouter.ai/auth")
  authorizationUrl.searchParams.set("callback_url", callbackUrl.toString())
  authorizationUrl.searchParams.set("code_challenge", challenge)
  authorizationUrl.searchParams.set("code_challenge_method", "S256")

  return { authorizationUrl: authorizationUrl.toString(), verifier }
}
