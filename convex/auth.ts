import { v } from "convex/values"

import { query } from "./_generated/server"

export const viewer = query({
  args: {},
  returns: v.object({
    name: v.union(v.string(), v.null()),
    email: v.union(v.string(), v.null()),
  }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new Error("Not authenticated")
    }

    return {
      name: identity.name ?? null,
      email: identity.email ?? null,
    }
  },
})
