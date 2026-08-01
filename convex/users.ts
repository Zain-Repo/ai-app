import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { getCurrentUser } from "./authHelpers"

const languageValidator = v.union(
  v.literal("auto"),
  v.literal("en"),
  v.literal("fr"),
  v.literal("es")
)

const intelligenceLevelValidator = v.union(
  v.literal("adaptive"),
  v.literal("quick"),
  v.literal("balanced"),
  v.literal("deep")
)

const responseDetailValidator = v.union(
  v.literal("concise"),
  v.literal("balanced"),
  v.literal("detailed")
)

const userMessageBubbleColorValidator = v.union(
  v.literal("default"),
  v.literal("sky"),
  v.literal("violet"),
  v.literal("rose"),
  v.literal("emerald"),
  v.literal("amber"),
  v.literal("slate")
)

const MAX_MODEL_LENGTH = 200

const preferencesValidator = v.object({
  defaultModel: v.union(v.string(), v.null()),
  language: languageValidator,
  intelligenceLevel: intelligenceLevelValidator,
  responseDetail: responseDetailValidator,
  userMessageBubbleColor: userMessageBubbleColorValidator,
})

export const getPreferences = query({
  args: {},
  returns: preferencesValidator,
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    return {
      defaultModel: user.defaultModel ?? null,
      language: user.language ?? "auto",
      intelligenceLevel: user.intelligenceLevel ?? "adaptive",
      responseDetail: user.responseDetail ?? "balanced",
      userMessageBubbleColor: user.userMessageBubbleColor ?? "default",
    }
  },
})

export const updatePreferences = mutation({
  args: preferencesValidator.fields,
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const defaultModel = args.defaultModel?.trim() || undefined
    if (defaultModel && defaultModel.length > MAX_MODEL_LENGTH)
      throw new Error("Model is unavailable")
    await ctx.db.patch(user._id, { ...args, defaultModel })
    return null
  },
})

export const syncCurrent = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()

    if (!identity) {
      throw new Error("Not authenticated")
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (indexQuery) =>
        indexQuery.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique()

    const profile = {
      tokenIdentifier: identity.tokenIdentifier,
      clerkUserId: identity.subject,
      lastSeenAt: Date.now(),
      ...(identity.name ? { name: identity.name } : {}),
      ...(identity.email ? { email: identity.email } : {}),
      ...(identity.pictureUrl ? { imageUrl: identity.pictureUrl } : {}),
    }

    if (existing) {
      await ctx.db.patch(existing._id, profile)
      return existing._id
    }

    return await ctx.db.insert("users", profile)
  },
})
