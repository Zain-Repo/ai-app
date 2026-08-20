import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { action, env } from "./_generated/server"
import type { ActionCtx } from "./_generated/server"
import { imageGenerationConfigValidator } from "./imageGenerationPolicy"
import { loadOpenRouterImageCapability } from "./imageModelCapabilities"
import { decryptProviderToken } from "./providerCrypto"
import {
  getStaticImageModelCapability,
  validateImageGenerationConfig,
} from "../shared/image-generation"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

async function loadCurrentCapability(
  ctx: ActionCtx,
  args: {
    model: string
    provider: "fal" | "openrouter" | "ai_gateway"
    routingProvider?: string
  }
) {
  if (args.provider === "fal" || args.provider === "ai_gateway")
    return getStaticImageModelCapability(args.provider, args.model)

  const credential = await ctx.runQuery(
    internal.providerConnections.getOpenRouterCredential,
    {}
  )
  if (!credential) throw new Error("Provider not connected")
  const token = await decryptProviderToken(
    credential.ciphertext,
    credential.iv,
    env.PROVIDER_TOKEN_ENCRYPTION_KEY,
    "openrouter"
  )
  try {
    return await loadOpenRouterImageCapability(
      token,
      args.model,
      args.routingProvider
    )
  } catch (cause) {
    if (
      isRecord(cause) &&
      (cause.statusCode === 401 || cause.statusCode === 403)
    )
      await ctx.runMutation(
        internal.providerConnections.markOpenRouterNeedsAuthentication,
        {}
      )
    throw cause
  }
}

export const create = action({
  args: {
    capabilityRevision: v.string(),
    clientRequestId: v.string(),
    config: imageGenerationConfigValidator,
    content: v.string(),
    conversationId: v.optional(v.string()),
    draftAttachmentIds: v.optional(v.array(v.id("draftAttachments"))),
    model: v.string(),
    projectId: v.optional(v.string()),
    provider: v.union(
      v.literal("fal"),
      v.literal("openrouter"),
      v.literal("ai_gateway")
    ),
    providerConnectionId: v.id("providerConnections"),
    routingProvider: v.optional(v.string()),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    generationSetId: v.id("imageGenerationSets"),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{
    conversationId: Id<"conversations">
    generationSetId: Id<"imageGenerationSets">
  }> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")

    const capability = await loadCurrentCapability(ctx, args)
    if (!capability) throw new Error("Image model is unavailable")
    if (capability.revision !== args.capabilityRevision)
      throw new Error("Image model settings changed. Review them and try again")
    const config = validateImageGenerationConfig(capability, args.config)

    return await ctx.runMutation(
      internal.imageGenerations.createGenerationRequest,
      {
        capability,
        clientRequestId: args.clientRequestId,
        config,
        content: args.content,
        ...(args.conversationId ? { conversationId: args.conversationId } : {}),
        ...(args.draftAttachmentIds?.length
          ? { draftAttachmentIds: args.draftAttachmentIds }
          : {}),
        model: args.model,
        ...(args.projectId ? { projectId: args.projectId } : {}),
        providerConnectionId: args.providerConnectionId,
        ...(args.routingProvider
          ? { routingProvider: args.routingProvider }
          : {}),
      }
    )
  },
})

export const retry = action({
  args: { generationSetId: v.id("imageGenerationSets") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Not authenticated")
    const retryContext = await ctx.runQuery(
      internal.imageGenerations.getRetryContext,
      args
    )
    const capability = await loadCurrentCapability(ctx, {
      model: retryContext.model,
      provider: retryContext.provider,
      ...(retryContext.routingProvider
        ? { routingProvider: retryContext.routingProvider }
        : {}),
    })
    if (!capability) throw new Error("Image model is unavailable")
    if (capability.revision !== retryContext.capabilityRevision)
      throw new Error(
        "Image model settings changed. Use these settings in a new generation"
      )
    validateImageGenerationConfig(capability, retryContext.config)
    await ctx.runMutation(internal.imageGenerations.requeue, args)
    return null
  },
})
