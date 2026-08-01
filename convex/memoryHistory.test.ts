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
        historyRevision: 1,
        content: "A summary that must not be stored.",
      })
    ).resolves.toBe(false)
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId: standardConversationId,
        historyRevision: 1,
        content: "A summary that can be stored.",
      })
    ).resolves.toBe(true)
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId: defaultConversationId,
        historyRevision: 1,
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
    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { memoryHistoryRevision: 2 })
    })
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId: standardConversationId,
        historyRevision: 1,
        content: "A stale summary that must not be stored.",
      })
    ).resolves.toBe(false)
  })

  it("recalls history in read-only conversations even when saved memory is disabled", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|read-only-history-recall"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const { conversationId, messageId, summaryId } = await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, {
        memoryHistoryEnabled: true,
        memoryHistoryRevision: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Read only history recall",
        memoryMode: "read_only",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "What did we decide about the migration?",
        status: "complete",
      })
      const createdSummaryId = await ctx.db.insert("conversationMemorySummaries", {
        ownerId,
        conversationId: createdConversationId,
        content: "The migration will remain provider-neutral.",
        revision: 1,
        updatedAt: 1,
      })
      return {
        conversationId: createdConversationId,
        messageId: createdMessageId,
        summaryId: createdSummaryId,
      }
    })

    const context = await t.query(internal.memoryContext.buildAgentContext, {
      ownerId,
      conversationId,
      currentMessageId: messageId,
    })
    expect(context.memoryMode).toBe("read_only")
    expect(context.degradedReason).toBe("saved_memory_disabled")
    expect(context.historySummaryIds).toContain(summaryId)
    expect(context.referenceText).toContain("provider-neutral")
  })

  it("excludes project-only summaries from personal and all-chats history recall", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|project-history-isolation"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const {
      allChatsConversationId,
      allChatsMessageId,
      isolatedSummaryId,
      personalConversationId,
      personalMessageId,
      sharedSummaryId,
    } = await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, {
        memoryHistoryEnabled: true,
        memoryHistoryRevision: 1,
      })
      const isolatedProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Isolated project",
        memoryScope: "project_only",
        updatedAt: 1,
      })
      const sharedProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Shared project",
        memoryScope: "all_chats",
        updatedAt: 1,
      })
      const personalId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Personal history",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const allChatsId = await ctx.db.insert("conversations", {
        ownerId,
        projectId: sharedProjectId,
        status: "active",
        title: "All chats history",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const isolatedConversationId = await ctx.db.insert("conversations", {
        ownerId,
        projectId: isolatedProjectId,
        status: "active",
        title: "Isolated history",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const sharedConversationId = await ctx.db.insert("conversations", {
        ownerId,
        projectId: sharedProjectId,
        status: "active",
        title: "Shared history",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const personalIdMessage = await ctx.db.insert("messages", {
        conversationId: personalId,
        role: "user",
        content: "What was the migration decision?",
        status: "complete",
      })
      const allChatsIdMessage = await ctx.db.insert("messages", {
        conversationId: allChatsId,
        role: "user",
        content: "What was the migration decision?",
        status: "complete",
      })
      const isolatedId = await ctx.db.insert("conversationMemorySummaries", {
        ownerId,
        conversationId: isolatedConversationId,
        projectId: isolatedProjectId,
        content: "Migration decision: isolated project secret.",
        revision: 1,
        updatedAt: 1,
      })
      const sharedId = await ctx.db.insert("conversationMemorySummaries", {
        ownerId,
        conversationId: sharedConversationId,
        projectId: sharedProjectId,
        content: "Migration decision: provider-neutral rollout.",
        revision: 1,
        updatedAt: 1,
      })
      return {
        allChatsConversationId: allChatsId,
        allChatsMessageId: allChatsIdMessage,
        isolatedSummaryId: isolatedId,
        personalConversationId: personalId,
        personalMessageId: personalIdMessage,
        sharedSummaryId: sharedId,
      }
    })

    const contexts = await Promise.all([
      t.query(internal.memoryContext.buildAgentContext, {
        ownerId,
        conversationId: personalConversationId,
        currentMessageId: personalMessageId,
      }),
      t.query(internal.memoryContext.buildAgentContext, {
        ownerId,
        conversationId: allChatsConversationId,
        currentMessageId: allChatsMessageId,
      }),
    ])
    for (const context of contexts) {
      expect(context.historySummaryIds).toContain(sharedSummaryId)
      expect(context.historySummaryIds).not.toContain(isolatedSummaryId)
      expect(context.referenceText).toContain("provider-neutral")
      expect(context.referenceText).not.toContain("isolated project secret")
    }
  })
})
