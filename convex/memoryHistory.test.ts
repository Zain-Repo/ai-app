import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

function identity(tokenIdentifier: string) {
  return { subject: tokenIdentifier, tokenIdentifier }
}

describe("memory history capture", () => {
  it("only queues, processes, and writes summaries for standard conversations", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|history-mode"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const now = Date.now()
    const {
      defaultConversationId,
      profileId,
      readOnlyConversationId,
      standardConversationId,
    } = await t.run(
      async (ctx) => {
        await ctx.db.patch(ownerId, {
          memoryHistoryEnabled: true,
          memoryHistoryRevision: 1,
        })
        const connectionId = await ctx.db.insert("providerConnections", {
          ownerId,
          provider: "openrouter",
          authMethod: "oauth",
          status: "connected",
          scopes: ["responses"],
          updatedAt: now,
        })
        const createdProfileId = await ctx.db.insert("memoryProcessingProfiles", {
          ownerId,
          providerConnectionId: connectionId,
          provider: "openrouter",
          extractionModel: "openai/gpt-4o-mini",
          embeddingModel: "openai/text-embedding-3-small",
          dimensions: 1536,
          policyRevision: 1,
          status: "active",
          updatedAt: now,
        })
        const createdReadOnlyConversationId = await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: "Read only history",
          memoryMode: "read_only",
          updatedAt: now,
        })
        const createdStandardConversationId = await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: "Standard history",
          memoryMode: "standard",
          updatedAt: now,
        })
        const createdDefaultConversationId = await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: "Default standard history",
          updatedAt: now,
        })
        return {
          defaultConversationId: createdDefaultConversationId,
          profileId: createdProfileId,
          readOnlyConversationId: createdReadOnlyConversationId,
          standardConversationId: createdStandardConversationId,
        }
      }
    )

    await expect(
      t.mutation(internal.memoryHistory.enqueueBackfill, { ownerId, now })
    ).resolves.toBe(2)
    const queuedJobs = await t.run(async (ctx) =>
      await ctx.db
        .query("memoryJobs")
        .withIndex("by_owner_id_and_status_and_next_attempt_at", (q) =>
          q.eq("ownerId", ownerId).eq("status", "queued")
        )
        .take(10)
    )
    expect(queuedJobs.map((job) => job.sourceConversationId)).toEqual(
      expect.arrayContaining([defaultConversationId, standardConversationId])
    )

    const readOnlyJobId = await t.run(async (ctx) =>
      await ctx.db.insert("memoryJobs", {
        ownerId,
        kind: "history_backfill",
        sourceConversationId: readOnlyConversationId,
        profileId,
        profileRevision: 1,
        policyRevision: 1,
        historyRevision: 1,
        status: "running",
        attempts: 1,
        nextAttemptAt: now,
        createdAt: now,
        updatedAt: now,
      })
    )

    await expect(
      t.query(internal.memoryHistory.getHistoryProcessingContext, {
        jobId: readOnlyJobId,
      })
    ).resolves.toBeNull()
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId: readOnlyConversationId,
        content: "A summary that must not be stored.",
      })
    ).resolves.toBe(false)
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId: standardConversationId,
        content: "A summary that can be stored.",
      })
    ).resolves.toBe(true)
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId: defaultConversationId,
        content: "A legacy-default summary that can be stored.",
      })
    ).resolves.toBe(true)
    const summaries = await t.run(async (ctx) =>
      await ctx.db
        .query("conversationMemorySummaries")
        .withIndex("by_owner_id_and_updated_at", (q) => q.eq("ownerId", ownerId))
        .take(10)
    )
    expect(summaries.map((summary) => summary.conversationId)).toEqual(
      expect.arrayContaining([defaultConversationId, standardConversationId])
    )
  })
})
