import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("providerConnections", () => {
  it("requires authentication and keeps one encrypted OpenRouter connection", async () => {
    const t = convexTest(schema, modules)

    await expect(t.query(api.providerConnections.listMine)).rejects.toThrow(
      "Not authenticated"
    )

    const authenticated = t.withIdentity({
      subject: "user_123",
      tokenIdentifier: "https://clerk.example.test|user_123",
    })
    await authenticated.mutation(api.users.syncCurrent)

    const openRouterId = await authenticated.mutation(
      internal.providerConnections.completeOpenRouterOAuth,
      { ciphertext: "encrypted", iv: "random-iv" }
    )
    const repeatedId = await authenticated.mutation(
      internal.providerConnections.completeOpenRouterOAuth,
      { ciphertext: "rotated", iv: "new-iv" }
    )
    const connections = await authenticated.query(
      api.providerConnections.listMine
    )

    expect(repeatedId).toEqual(openRouterId)
    expect(connections).toContainEqual({
      authMethod: "oauth",
      connectionId: openRouterId,
      displayName: "OpenRouter",
      provider: "openrouter",
      status: "connected",
    })
    await expect(
      authenticated.query(
        internal.providerConnections.getOpenRouterCredential,
        {}
      )
    ).resolves.toEqual({ ciphertext: "rotated", iv: "new-iv" })
  })
})
