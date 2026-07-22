import type { MutationCtx, QueryCtx } from "./_generated/server"

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity()

  if (!identity) {
    throw new Error("Not authenticated")
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token_identifier", (query) =>
      query.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique()

  if (!user) {
    throw new Error("User workspace not found")
  }

  return user
}
