import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

function identity(tokenIdentifier: string) {
  return { subject: tokenIdentifier, tokenIdentifier }
}

describe("conversation response memory sources", () => {
  it("groups multiple response sources with one owned conversation query", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|response-source-owner"))
    const outsider = t.withIdentity(identity("clerk|response-source-outsider"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const outsiderId = await outsider.mutation(api.users.syncCurrent)
    const {
      conversationId,
      firstResponseId,
      secondResponseId,
      foreignConversationId,
    } = await t.run(async (ctx) => {
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Memory source grouping",
        updatedAt: 1,
      })
      const createdFirstResponseId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "assistant",
        content: "First response.",
        status: "complete",
      })
      const createdSecondResponseId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "assistant",
        content: "Second response.",
        status: "complete",
      })
      const memoryItemId = await ctx.db.insert("memoryItems", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        category: "preference",
        canonicalKey: "preferences.test",
        content: "Use grouped sources.",
        status: "active",
        sourceSignal: "manual",
        confirmation: "confirmed",
        pinned: false,
        sensitivity: "normal",
        revision: 1,
        sourceTimestamp: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      const summaryId = await ctx.db.insert("conversationMemorySummaries", {
        ownerId,
        conversationId: createdConversationId,
        content: "A relevant history summary.",
        revision: 1,
        updatedAt: 1,
      })
      await ctx.db.insert("responseMemoryReferences", {
        ownerId,
        conversationId: createdConversationId,
        responseMessageId: createdFirstResponseId,
        memoryItemId,
        createdAt: 1,
      })
      await ctx.db.insert("responseMemoryReferences", {
        ownerId,
        conversationId: createdConversationId,
        responseMessageId: createdSecondResponseId,
        summaryId,
        feedback: "helpful",
        createdAt: 2,
      })
      const createdForeignConversationId = await ctx.db.insert(
        "conversations",
        {
          ownerId: outsiderId,
          status: "active",
          title: "Foreign memory sources",
          updatedAt: 1,
        }
      )
      return {
        conversationId: createdConversationId,
        firstResponseId: createdFirstResponseId,
        secondResponseId: createdSecondResponseId,
        foreignConversationId: createdForeignConversationId,
      }
    })

    await expect(
      outsider.query(api.memories.listConversationResponseSources, {
        conversationId,
      })
    ).rejects.toThrow("Conversation unavailable")
    const groups = await owner.query(
      api.memories.listConversationResponseSources,
      {
        conversationId,
      }
    )
    const firstResponseSources = await owner.query(
      api.memories.listResponseSources,
      {
        responseMessageId: firstResponseId,
      }
    )

    expect(groups).toEqual([
      {
        responseMessageId: firstResponseId,
        sources: [
          expect.objectContaining({
            memoryItemId: expect.any(String),
            createdAt: 1,
          }),
        ],
      },
      {
        responseMessageId: secondResponseId,
        sources: [
          expect.objectContaining({
            summaryId: expect.any(String),
            feedback: "helpful",
            createdAt: 2,
          }),
        ],
      },
    ])
    expect(firstResponseSources).toMatchObject([
      { memoryItemId: expect.any(String), createdAt: 1 },
    ])
    await expect(
      owner.query(api.memories.listConversationResponseSources, {
        conversationId: foreignConversationId,
      })
    ).rejects.toThrow("Conversation unavailable")
  })
})
