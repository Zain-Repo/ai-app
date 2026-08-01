import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

function identity(tokenIdentifier: string) {
  return { subject: tokenIdentifier, tokenIdentifier }
}

describe("memory retention", () => {
  it("drains conversation response references in scheduled bounded batches", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|conversation-erasure"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const memoryItemId = await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.preserved_after_chat_delete",
      content: "This saved memory must survive chat deletion.",
      category: "preference",
      scope: "user",
    })
    const conversationId = await t.run(async (ctx) =>
      await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Deleted chat",
        memoryMode: "standard",
        updatedAt: 1,
      })
    )
    await t.run(async (ctx) => {
      const responseMessageId = await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: "A response.",
        status: "complete",
      })
      await ctx.db.insert("conversationMemorySummaries", {
        ownerId,
        conversationId,
        content: "History summary.",
        revision: 1,
        updatedAt: 1,
      })
      for (let index = 0; index < 101; index += 1) {
        await ctx.db.insert("responseMemoryReferences", {
          ownerId,
          conversationId,
          responseMessageId,
          createdAt: index,
        })
      }
    })

    vi.useFakeTimers()
    try {
      await t.mutation(internal.memoryRetention.eraseConversationMemoryArtifacts, {
        ownerId,
        conversationId,
      })
      expect(
        await t.run(async (ctx) =>
          await ctx.db
            .query("responseMemoryReferences")
            .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
            .take(102)
        )
      ).toHaveLength(1)

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    } finally {
      vi.useRealTimers()
    }

    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("responseMemoryReferences")
          .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
          .take(1)
      )
    ).toEqual([])
    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("conversationMemorySummaries")
          .withIndex("by_conversation_id", (q) => q.eq("conversationId", conversationId))
          .unique()
      )
    ).toBeNull()
    expect(await t.run((ctx) => ctx.db.get(memoryItemId))).not.toBeNull()
  })
})
