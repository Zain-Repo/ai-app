import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

function identity(tokenIdentifier: string) {
  return { subject: tokenIdentifier, tokenIdentifier }
}

describe("realtime voice conversations", () => {
  it("creates an owned project chat before a voice transcript and builds initial memory context", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|realtime-owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const memoryItemId = await owner.mutation(api.memories.create, {
      canonicalKey: "profile.voice_style",
      content: "Prefers a concise voice conversation.",
      category: "core_profile",
      scope: "user",
    })
    const { openAiConnectionId, projectId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openai",
        authMethod: "api_key",
        status: "connected",
        scopes: ["responses"],
        updatedAt: 1,
      })
      const createdProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Voice project",
        memoryScope: "all_chats",
        updatedAt: 1,
      })
      return { openAiConnectionId: connectionId, projectId: createdProjectId }
    })

    const conversationId = await owner.mutation(api.conversations.startRealtime, {
      projectId,
    })
    const conversation = await t.run(async (ctx) => await ctx.db.get(conversationId))
    expect(conversation).toMatchObject({
      ownerId,
      projectId,
      providerConnectionId: openAiConnectionId,
      status: "active",
      title: "Voice conversation",
      model: "gpt-4o-mini",
      outputMode: "text",
    })
    const request = await owner.query(
      internal.conversations.getRealtimeMemoryContextRequest,
      { conversationId }
    )
    expect(request).toMatchObject({ conversationId, ownerId })
    expect(request?.currentMessageId).toBeUndefined()
    const context = await t.query(internal.memoryContext.buildAgentContext, {
      ownerId,
      conversationId,
    })
    expect(context.selectedMemoryItemIds).toContain(memoryItemId)
    expect(context.referenceText).toContain("concise voice conversation")

    await owner.mutation(api.conversations.commitRealtimeTranscript, {
      conversationId,
      content: "Hello from voice.",
      role: "user",
    })
    const requestAfterTranscript = await owner.query(
      internal.conversations.getRealtimeMemoryContextRequest,
      { conversationId }
    )
    expect(requestAfterTranscript?.currentMessageId).toBeDefined()
  })
})
