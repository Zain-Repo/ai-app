import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("auth.viewer", () => {
  it("rejects an anonymous caller", async () => {
    const t = convexTest(schema, modules)

    await expect(t.query(api.auth.viewer)).rejects.toThrow("Not authenticated")
  })

  it("returns the authenticated Clerk identity", async () => {
    const t = convexTest(schema, modules)
    const authenticated = t.withIdentity({
      name: "Ada Lovelace",
      email: "ada@example.com",
    })

    await expect(authenticated.query(api.auth.viewer)).resolves.toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
    })
  })
})
