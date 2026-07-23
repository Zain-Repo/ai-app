import { v } from "convex/values"

import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { getCurrentUser } from "./authHelpers"

const status = v.union(
  v.literal("connected"),
  v.literal("needs_reauthentication"),
  v.literal("disconnected")
)
const provider = v.union(
  v.literal("openrouter"),
  v.literal("openai"),
  v.literal("codex")
)

export const listMine = query({
  args: {},
  returns: v.array(
    v.object({
      connectionId: v.id("providerConnections"),
      provider,
      authMethod: v.union(v.literal("oauth"), v.literal("api_key")),
      status,
      displayName: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)

    const connections = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .take(50)

    return connections.map((connection) => ({
      connectionId: connection._id,
      provider: connection.provider as "openrouter" | "openai" | "codex",
      authMethod: connection.authMethod,
      status: connection.status,
      ...(connection.displayName
        ? { displayName: connection.displayName }
        : {}),
    }))
  },
})

export const connectDesktopCodex = mutation({
  args: {
    email: v.optional(v.string()),
    planType: v.optional(v.string()),
  },
  returns: v.id("providerConnections"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const email = args.email?.trim()
    const planType = args.planType?.trim()
    if (email && email.length > 320)
      throw new Error("OpenAI account is invalid")
    if (planType && planType.length > 50)
      throw new Error("OpenAI plan is invalid")
    const existing = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", user._id).eq("provider", "codex")
      )
      .unique()
    const metadata = {
      authMethod: "oauth" as const,
      displayName: "ChatGPT subscription",
      ...(email ? { externalAccountId: email } : {}),
      scopes: ["codex", ...(planType ? [`plan:${planType}`] : [])],
      status: "connected" as const,
      updatedAt: Date.now(),
    }
    if (existing) {
      await ctx.db.patch(existing._id, metadata)
      return existing._id
    }
    return await ctx.db.insert("providerConnections", {
      ...metadata,
      ownerId: user._id,
      provider: "codex",
    })
  },
})

export const completeOpenRouterOAuth = internalMutation({
  args: {
    ciphertext: v.string(),
    iv: v.string(),
  },
  returns: v.id("providerConnections"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const existing = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (indexQuery) =>
        indexQuery.eq("ownerId", user._id).eq("provider", "openrouter")
      )
      .unique()
    const connection = {
      authMethod: "oauth" as const,
      displayName: "OpenRouter",
      scopes: ["models", "responses"],
      status: "connected" as const,
      updatedAt: Date.now(),
    }
    let connectionId
    if (existing) {
      await ctx.db.patch(existing._id, connection)
      connectionId = existing._id
    } else {
      connectionId = await ctx.db.insert("providerConnections", {
        ...connection,
        ownerId: user._id,
        provider: "openrouter",
      })
    }
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (indexQuery) =>
        indexQuery.eq("connectionId", connectionId)
      )
      .unique()
    const encryptedCredential = {
      ciphertext: args.ciphertext,
      iv: args.iv,
      updatedAt: Date.now(),
    }

    if (credential) {
      await ctx.db.patch(credential._id, encryptedCredential)
    } else {
      await ctx.db.insert("providerCredentials", {
        ...encryptedCredential,
        connectionId,
      })
    }

    return connectionId
  },
})

export const completeApiKey = internalMutation({
  args: { ciphertext: v.string(), iv: v.string(), provider },
  returns: v.id("providerConnections"),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const existing = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", user._id).eq("provider", args.provider)
      )
      .unique()
    const metadata = {
      authMethod: "api_key" as const,
      displayName: args.provider === "openai" ? "OpenAI" : args.provider,
      scopes: ["models", "responses"],
      status: "connected" as const,
      updatedAt: Date.now(),
    }
    const connectionId = existing
      ? existing._id
      : await ctx.db.insert("providerConnections", {
          ...metadata,
          ownerId: user._id,
          provider: args.provider,
        })
    if (existing) await ctx.db.patch(existing._id, metadata)
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (q) => q.eq("connectionId", connectionId))
      .unique()
    const encrypted = {
      ciphertext: args.ciphertext,
      iv: args.iv,
      updatedAt: Date.now(),
    }
    if (credential) await ctx.db.patch(credential._id, encrypted)
    else
      await ctx.db.insert("providerCredentials", { ...encrypted, connectionId })
    return connectionId
  },
})

export const getProviderCredential = internalQuery({
  args: { provider },
  returns: v.union(
    v.object({ ciphertext: v.string(), iv: v.string() }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx)
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (indexQuery) =>
        indexQuery.eq("ownerId", user._id).eq("provider", args.provider)
      )
      .unique()

    if (!connection || connection.status !== "connected") return null

    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (indexQuery) =>
        indexQuery.eq("connectionId", connection._id)
      )
      .unique()

    return credential
      ? { ciphertext: credential.ciphertext, iv: credential.iv }
      : null
  },
})

export const getOpenRouterCredential = internalQuery({
  args: {},
  returns: v.union(
    v.object({ ciphertext: v.string(), iv: v.string() }),
    v.null()
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (q) =>
        q.eq("ownerId", user._id).eq("provider", "openrouter")
      )
      .unique()
    if (!connection || connection.status !== "connected") return null
    const credential = await ctx.db
      .query("providerCredentials")
      .withIndex("by_connection_id", (q) =>
        q.eq("connectionId", connection._id)
      )
      .unique()
    return credential
      ? { ciphertext: credential.ciphertext, iv: credential.iv }
      : null
  },
})

export const markProviderNeedsAuthentication = internalMutation({
  args: { connectionId: v.id("providerConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId)
    if (connection)
      await ctx.db.patch(connection._id, {
        status: "needs_reauthentication",
        updatedAt: Date.now(),
      })
    return null
  },
})

export const markOpenRouterNeedsAuthentication = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx)
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_owner_provider", (indexQuery) =>
        indexQuery.eq("ownerId", user._id).eq("provider", "openrouter")
      )
      .unique()

    if (connection) {
      await ctx.db.patch(connection._id, {
        status: "needs_reauthentication",
        updatedAt: Date.now(),
      })
    }

    return null
  },
})

export const markOpenRouterConnectionNeedsAuthentication = internalMutation({
  args: { connectionId: v.id("providerConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId)
    if (connection?.provider === "openrouter") {
      await ctx.db.patch(connection._id, {
        status: "needs_reauthentication",
        updatedAt: Date.now(),
      })
    }
    return null
  },
})
