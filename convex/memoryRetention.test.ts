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

  it("drains project summaries in batches without deleting another project's summaries", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|project-summary-erasure"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const { targetProjectId, unrelatedProjectId } = await t.run(async (ctx) => {
      const createdTargetProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Target project",
        updatedAt: 1,
      })
      const createdUnrelatedProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Unrelated project",
        updatedAt: 1,
      })
      for (let index = 0; index < 101; index += 1) {
        const conversationId = await ctx.db.insert("conversations", {
          ownerId,
          projectId: createdTargetProjectId,
          status: "active",
          title: `Target ${index}`,
          memoryMode: "standard",
          updatedAt: index,
        })
        await ctx.db.insert("conversationMemorySummaries", {
          ownerId,
          conversationId,
          projectId: createdTargetProjectId,
          content: `Target summary ${index}.`,
          revision: 1,
          updatedAt: index,
        })
      }
      for (let index = 0; index < 2; index += 1) {
        const conversationId = await ctx.db.insert("conversations", {
          ownerId,
          projectId: createdUnrelatedProjectId,
          status: "active",
          title: `Unrelated ${index}`,
          memoryMode: "standard",
          updatedAt: index,
        })
        await ctx.db.insert("conversationMemorySummaries", {
          ownerId,
          conversationId,
          projectId: createdUnrelatedProjectId,
          content: `Unrelated summary ${index}.`,
          revision: 1,
          updatedAt: index,
        })
      }
      return {
        targetProjectId: createdTargetProjectId,
        unrelatedProjectId: createdUnrelatedProjectId,
      }
    })

    vi.useFakeTimers()
    try {
      await expect(
        t.mutation(internal.memoryRetention.eraseProjectMemoryArtifacts, {
          ownerId,
          projectId: targetProjectId,
        })
      ).resolves.toEqual({ remaining: true })
      expect(
        await t.run(async (ctx) =>
          await ctx.db
            .query("conversationMemorySummaries")
            .withIndex("by_owner_id_and_project_id_and_updated_at", (q) =>
              q.eq("ownerId", ownerId).eq("projectId", targetProjectId)
            )
            .take(102)
        )
      ).toHaveLength(1)

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    } finally {
      vi.useRealTimers()
    }

    const [targetSummaries, unrelatedSummaries] = await t.run(async (ctx) =>
      await Promise.all([
        ctx.db
          .query("conversationMemorySummaries")
          .withIndex("by_owner_id_and_project_id_and_updated_at", (q) =>
            q.eq("ownerId", ownerId).eq("projectId", targetProjectId)
          )
          .take(1),
        ctx.db
          .query("conversationMemorySummaries")
          .withIndex("by_owner_id_and_project_id_and_updated_at", (q) =>
            q.eq("ownerId", ownerId).eq("projectId", unrelatedProjectId)
          )
          .take(3),
      ])
    )
    expect(targetSummaries).toEqual([])
    expect(unrelatedSummaries).toHaveLength(2)
  })

  it("reschedules owner erasure when one memory has a full child-artifact batch", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner-artifact-erasure"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const { memoryItemId } = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Artifact source",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Source message.",
        status: "complete",
      })
      const createdMemoryItemId = await ctx.db.insert("memoryItems", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        category: "fact",
        canonicalKey: "fact.with_many_evidence_rows",
        content: "A fact with many evidence rows.",
        status: "active",
        sourceSignal: "direct_statement",
        confirmation: "confirmed",
        pinned: false,
        sensitivity: "normal",
        revision: 1,
        sourceConversationId: conversationId,
        sourceMessageId: messageId,
        sourceTimestamp: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("memoryEvidence", {
          ownerId,
          memoryItemId: createdMemoryItemId,
          sourceConversationId: conversationId,
          sourceMessageId: messageId,
          sourceSignal: "direct_statement",
          createdAt: index,
        })
      }
      return { memoryItemId: createdMemoryItemId }
    })

    vi.useFakeTimers()
    try {
      await expect(
        t.mutation(internal.memoryRetention.eraseOwnerMemoryArtifacts, { ownerId })
      ).resolves.toEqual({ remaining: true })
      expect(await t.run((ctx) => ctx.db.get(memoryItemId))).not.toBeNull()

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    } finally {
      vi.useRealTimers()
    }

    expect(await t.run((ctx) => ctx.db.get(memoryItemId))).toBeNull()
    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("memoryEvidence")
          .withIndex("by_memory_item_id_and_created_at", (q) =>
            q.eq("memoryItemId", memoryItemId)
          )
          .take(1)
      )
    ).toEqual([])
  })

  it("reschedules project erasure when one project memory has a full child-artifact batch", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|project-artifact-erasure"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const { memoryItemId, projectId } = await t.run(async (ctx) => {
      const createdProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Artifact project",
        updatedAt: 1,
      })
      const conversationId = await ctx.db.insert("conversations", {
        ownerId,
        projectId: createdProjectId,
        status: "active",
        title: "Project artifact source",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Project source message.",
        status: "complete",
      })
      const createdMemoryItemId = await ctx.db.insert("memoryItems", {
        ownerId,
        projectId: createdProjectId,
        scope: "project",
        scopeKey: `project:${createdProjectId}`,
        category: "fact",
        canonicalKey: "project.fact.with_many_evidence_rows",
        content: "A project fact with many evidence rows.",
        status: "active",
        sourceSignal: "direct_statement",
        confirmation: "confirmed",
        pinned: false,
        sensitivity: "normal",
        revision: 1,
        sourceConversationId: conversationId,
        sourceMessageId: messageId,
        sourceTimestamp: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("memoryEvidence", {
          ownerId,
          memoryItemId: createdMemoryItemId,
          sourceConversationId: conversationId,
          sourceMessageId: messageId,
          sourceSignal: "direct_statement",
          createdAt: index,
        })
      }
      return { memoryItemId: createdMemoryItemId, projectId: createdProjectId }
    })

    vi.useFakeTimers()
    try {
      await expect(
        t.mutation(internal.memoryRetention.eraseProjectMemoryArtifacts, {
          ownerId,
          projectId,
        })
      ).resolves.toEqual({ remaining: true })
      expect(await t.run((ctx) => ctx.db.get(memoryItemId))).not.toBeNull()

      await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    } finally {
      vi.useRealTimers()
    }

    expect(await t.run((ctx) => ctx.db.get(memoryItemId))).toBeNull()
  })

  it("deletes embedding jobs bound to an erased project memory", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|project-embedding-job-erasure"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const { memoryItemId, projectId } = await t.run(async (ctx) => {
      const createdProjectId = await ctx.db.insert("projects", {
        ownerId,
        name: "Embedding job project",
        updatedAt: 1,
      })
      const createdMemoryItemId = await ctx.db.insert("memoryItems", {
        ownerId,
        projectId: createdProjectId,
        scope: "project",
        scopeKey: `project:${createdProjectId}`,
        category: "fact",
        canonicalKey: "project.fact.embedding_job",
        content: "A project fact with an embedding job.",
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
      await ctx.db.insert("memoryJobs", {
        ownerId,
        kind: "embed",
        memoryItemId: createdMemoryItemId,
        profileRevision: 1,
        policyRevision: 1,
        status: "queued",
        attempts: 0,
        nextAttemptAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      return { memoryItemId: createdMemoryItemId, projectId: createdProjectId }
    })

    await expect(
      t.mutation(internal.memoryRetention.eraseProjectMemoryArtifacts, {
        ownerId,
        projectId,
      })
    ).resolves.toEqual({ remaining: false })

    expect(await t.run((ctx) => ctx.db.get(memoryItemId))).toBeNull()
    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("memoryJobs")
          .withIndex("by_memory_item_id_and_profile_revision_and_kind", (q) =>
            q
              .eq("memoryItemId", memoryItemId)
              .eq("profileRevision", 1)
              .eq("kind", "embed")
          )
          .take(1)
      )
    ).toEqual([])
  })
})
