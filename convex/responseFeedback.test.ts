import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

function identity(tokenIdentifier: string) {
  return { subject: tokenIdentifier, tokenIdentifier }
}

describe("assistant response feedback", () => {
  it("stores positive feedback and aggregates liked response styles into memory", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|response-feedback-positive"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const responseMessageId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Feedback chat",
        updatedAt: 1,
      })
      return await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: "Keep answers concise and lead with the recommendation.",
        status: "complete",
      })
    })

    const conversationId = await t.run(async (ctx) => {
      const message = await ctx.db.get(responseMessageId)
      return message!.conversationId
    })

    await owner.mutation(api.responseFeedback.submit, {
      conversationId,
      responseMessageId,
      rating: "positive",
    })

    const feedback = await owner.query(api.responseFeedback.listConversation, {
      conversationId,
    })
    const memoryItems = await owner.query(api.memories.list, { status: "active" })

    expect(feedback).toEqual([
      expect.objectContaining({
        responseMessageId,
        rating: "positive",
        updatedAt: expect.any(Number),
      }),
    ])
    expect(memoryItems).toEqual([
      expect.objectContaining({
        canonicalKey: "workstyle.response_likes",
        category: "workstyle",
        content:
          "Liked this response style: Keep answers concise and lead with the recommendation.",
        confirmation: "confirmed",
        sourceSignal: "manual",
      }),
    ])
  })

  it("clears feedback when the same rating is toggled off", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|response-feedback-toggle"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const responseMessageId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Toggle feedback",
        updatedAt: 1,
      })
      return await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: "Use numbered steps when explaining fixes.",
        status: "complete",
      })
    })

    const conversationId = await t.run(async (ctx) => {
      const message = await ctx.db.get(responseMessageId)
      return message!.conversationId
    })

    await owner.mutation(api.responseFeedback.submit, {
      conversationId,
      responseMessageId,
      rating: "negative",
    })
    await owner.mutation(api.responseFeedback.submit, {
      conversationId,
      responseMessageId,
      rating: null,
    })

    const feedback = await owner.query(api.responseFeedback.listConversation, {
      conversationId,
    })

    expect(feedback).toEqual([])
  })
})

