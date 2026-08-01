import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"
import { modules } from "./test.setup"

function identity(tokenIdentifier: string) {
  return { subject: tokenIdentifier, tokenIdentifier }
}

describe("agent memory v2", () => {
  it("uses only owner-scoped, confirmed active memory as untrusted reference context", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const conversationId = await t.run(async (ctx) =>
      await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Memory context",
        updatedAt: 1,
      })
    )
    const messageId = await t.run(async (ctx) =>
      await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Tell me what you remember",
        status: "complete",
      })
    )
    const memoryItemId = await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.response_style",
      content: "Prefers concise answers.",
      category: "preference",
      scope: "user",
    })

    const context = await t.query(internal.memoryContext.buildAgentContext, {
      ownerId,
      conversationId,
      currentMessageId: messageId,
    })

    expect(context.referenceText).toContain("Quoted memory data")
    expect(context.referenceText).toContain("Prefers concise answers.")
    expect(context.selectedMemoryItemIds).toEqual([memoryItemId])
    expect(context.memoryMode).toBe("standard")
  })

  it("suppresses rejected history summaries and removes their response provenance", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|summary-feedback-owner"))
    const outsider = t.withIdentity(identity("clerk|summary-feedback-outsider"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await outsider.mutation(api.users.syncCurrent)
    const { conversationId, messageId, referenceId, summaryId } = await t.run(
      async (ctx) => {
        await ctx.db.patch(ownerId, {
          memoryHistoryEnabled: true,
          memoryHistoryRevision: 1,
        })
        const createdConversationId = await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: "History feedback",
          updatedAt: 1,
        })
        const createdMessageId = await ctx.db.insert("messages", {
          conversationId: createdConversationId,
          role: "user",
          content: "What do you remember about this decision?",
          status: "complete",
        })
        const responseMessageId = await ctx.db.insert("messages", {
          conversationId: createdConversationId,
          role: "assistant",
          content: "The old decision.",
          status: "complete",
        })
        const createdSummaryId = await ctx.db.insert(
          "conversationMemorySummaries",
          {
            ownerId,
            conversationId: createdConversationId,
            content: "The old decision should be recalled.",
            revision: 1,
            updatedAt: 1,
          }
        )
        const createdReferenceId = await ctx.db.insert(
          "responseMemoryReferences",
          {
            ownerId,
            conversationId: createdConversationId,
            responseMessageId,
            summaryId: createdSummaryId,
            createdAt: 1,
          }
        )
        await ctx.db.insert("responseMemoryReferences", {
          ownerId,
          conversationId: createdConversationId,
          responseMessageId,
          summaryId: createdSummaryId,
          createdAt: 2,
        })
        return {
          conversationId: createdConversationId,
          messageId: createdMessageId,
          referenceId: createdReferenceId,
          summaryId: createdSummaryId,
        }
      }
    )

    await expect(
      outsider.mutation(api.memories.submitFeedback, {
        referenceId,
        feedback: "dont_use",
      })
    ).rejects.toThrow("Memory reference unavailable")
    await owner.mutation(api.memories.submitFeedback, {
      referenceId,
      feedback: "dont_use",
    })

    const suppressedSummary = await t.run((ctx) => ctx.db.get(summaryId))
    expect(suppressedSummary?.suppressedAt).toEqual(expect.any(Number))
    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("responseMemoryReferences")
          .withIndex("by_summary_id", (q) => q.eq("summaryId", summaryId))
          .take(10)
      )
    ).toEqual([])
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId,
        historyRevision: 1,
        content: "A refreshed version must remain suppressed.",
      })
    ).resolves.toBe(true)
    const context = await t.query(internal.memoryContext.buildAgentContext, {
      ownerId,
      conversationId,
      currentMessageId: messageId,
    })
    expect(context.historySummaryIds).not.toContain(summaryId)
    expect(context.referenceText).not.toContain("refreshed version")
    const responseMessageId = await t.run(async (ctx) =>
      await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: "A response that raced with suppression.",
        status: "complete",
      })
    )
    await t.mutation(internal.memoryContext.recordResponseReferences, {
      ownerId,
      conversationId,
      responseMessageId,
      memoryItemIds: [],
      summaryIds: [summaryId],
    })
    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("responseMemoryReferences")
          .withIndex("by_summary_id", (q) => q.eq("summaryId", summaryId))
          .take(1)
      )
    ).toEqual([])
  })

  it("records usage time only for owned active memories used by a completed response", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|reference-usage-owner"))
    const outsider = t.withIdentity(identity("clerk|reference-usage-outsider"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const outsiderId = await outsider.mutation(api.users.syncCurrent)
    const { conversationId, memoryItemId, outsiderMemoryItemId, responseMessageId } =
      await t.run(async (ctx) => {
        const createdConversationId = await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: "Response attribution",
          updatedAt: 1,
        })
        const createdResponseMessageId = await ctx.db.insert("messages", {
          conversationId: createdConversationId,
          role: "assistant",
          content: "A completed response.",
          status: "complete",
        })
        const baseMemory = {
          scope: "user" as const,
          scopeKey: "user",
          category: "preference" as const,
          content: "Prefers focused tests.",
          status: "active" as const,
          sourceSignal: "manual" as const,
          confirmation: "confirmed" as const,
          pinned: false,
          sensitivity: "normal" as const,
          revision: 1,
          sourceTimestamp: 1,
          createdAt: 1,
          updatedAt: 1,
          lastUsedAt: 1,
        }
        const createdMemoryItemId = await ctx.db.insert("memoryItems", {
          ...baseMemory,
          ownerId,
          canonicalKey: "preferences.focused_tests",
        })
        const createdOutsiderMemoryItemId = await ctx.db.insert("memoryItems", {
          ...baseMemory,
          ownerId: outsiderId,
          canonicalKey: "preferences.outsider",
        })
        return {
          conversationId: createdConversationId,
          memoryItemId: createdMemoryItemId,
          outsiderMemoryItemId: createdOutsiderMemoryItemId,
          responseMessageId: createdResponseMessageId,
        }
      })

    await t.mutation(internal.memoryContext.recordResponseReferences, {
      ownerId,
      conversationId,
      responseMessageId,
      memoryItemIds: [memoryItemId, outsiderMemoryItemId],
      summaryIds: [],
    })

    expect((await t.run((ctx) => ctx.db.get(memoryItemId)))?.lastUsedAt).toBeGreaterThan(
      1
    )
    expect(
      (await t.run((ctx) => ctx.db.get(outsiderMemoryItemId)))?.lastUsedAt
    ).toBe(1)
    expect(
      await t.run(async (ctx) =>
        await ctx.db
          .query("responseMemoryReferences")
          .withIndex("by_response_message_id", (q) =>
            q.eq("responseMessageId", responseMessageId)
          )
          .take(10)
      )
    ).toHaveLength(1)
  })

  it("does not queue capture for read-only or off conversations", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const connectionId = await t.run(async (ctx) =>
      await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: ["responses"],
        updatedAt: 1,
      })
    )
    await owner.mutation(api.memories.setProcessingProfile, {
      providerConnectionId: connectionId,
    })
    const conversationId = await t.run(async (ctx) =>
      await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Read only",
        memoryMode: "read_only",
        updatedAt: 1,
      })
    )
    const messageId = await t.run(async (ctx) =>
      await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Remember that I use TypeScript",
        status: "complete",
      })
    )

    await expect(
      t.mutation(internal.memoryCapture.enqueueForMessage, {
        ownerId,
        conversationId,
        messageId,
      })
    ).resolves.toBeNull()
  })

  it("rejects stale capture creates and deletions after the memory revision changes", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|capture-revision"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const { conversationId, messageId, profileId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
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
        updatedAt: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Capture revision",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Remember my response style.",
        status: "complete",
      })
      return {
        conversationId: createdConversationId,
        messageId: createdMessageId,
        profileId: createdProfileId,
      }
    })
    const [originalMemoryId] = await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      candidates: [
        {
          canonicalKey: "preferences.original_style",
          content: "Prefers concise answers.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })
    expect(originalMemoryId).toBeDefined()
    await t.run(async (ctx) => {
      await ctx.db.patch(ownerId, { memoryRevision: 2 })
    })

    await expect(
      t.mutation(internal.memoryCapture.commitCandidates, {
        ownerId,
        conversationId,
        messageId,
        profileId,
        policyRevision: 1,
        memoryRevision: 1,
        candidates: [
          {
            canonicalKey: "preferences.stale_style",
            content: "Must not be recreated.",
            category: "preference",
            scope: "user",
            sourceSignal: "direct_statement",
          },
        ],
      })
    ).resolves.toEqual([])
    await expect(
      t.mutation(internal.memoryCapture.applyDeletions, {
        ownerId,
        conversationId,
        messageId,
        profileId,
        policyRevision: 1,
        memoryRevision: 1,
        deletions: [{ key: "preferences.original_style", scope: "user" }],
      })
    ).resolves.toBe(0)
    expect((await t.run((ctx) => ctx.db.get(originalMemoryId)))?.status).toBe("active")
    expect(await owner.query(api.memories.list, { status: "active" })).toHaveLength(1)
  })

  it("includes legacy-only keys in the shadow extraction context", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|shadow-forget"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const { jobId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: ["responses"],
        updatedAt: 1,
      })
      await ctx.db.insert("providerCredentials", {
        connectionId,
        ciphertext: "encrypted-token",
        iv: "initialization-vector",
        updatedAt: 1,
      })
      const profileId = await ctx.db.insert("memoryProcessingProfiles", {
        ownerId,
        providerConnectionId: connectionId,
        provider: "openrouter",
        extractionModel: "openai/gpt-4o-mini",
        embeddingModel: "openai/text-embedding-3-small",
        dimensions: 1536,
        policyRevision: 1,
        status: "active",
        updatedAt: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Shadow forget",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Forget my saved preferences.",
        status: "complete",
      })
      await ctx.db.insert("memories", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        searchScope: `user:${ownerId}`,
        kind: "preference",
        key: "preferences.legacy_only",
        content: "Legacy preference.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      const createdJobId = await ctx.db.insert("memoryJobs", {
        ownerId,
        kind: "capture",
        sourceConversationId: createdConversationId,
        sourceMessageId: createdMessageId,
        profileId,
        profileRevision: 1,
        policyRevision: 1,
        status: "running",
        attempts: 1,
        nextAttemptAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      return { jobId: createdJobId }
    })
    await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.v2_only",
      content: "V2 preference.",
      category: "preference",
      scope: "user",
    })

    const enabledContext = await t.query(internal.memoryCapture.getProcessingContext, {
      jobId,
      useLegacy: false,
    })
    const shadowContext = await t.query(internal.memoryCapture.getProcessingContext, {
      jobId,
      useLegacy: false,
      includeLegacyExistingKeys: true,
    })
    const offContext = await t.query(internal.memoryCapture.getProcessingContext, {
      jobId,
      useLegacy: true,
    })

    expect(enabledContext?.existingKeys).toEqual([
      { key: "preferences.v2_only", scope: "user" },
    ])
    expect(shadowContext?.existingKeys).toEqual(
      expect.arrayContaining([
        { key: "preferences.legacy_only", scope: "user" },
        { key: "preferences.v2_only", scope: "user" },
      ])
    )
    expect(offContext?.existingKeys).toEqual([
      { key: "preferences.legacy_only", scope: "user" },
    ])
  })

  it("keeps extracted sensitive details pending until the user explicitly confirms", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const profileId = await t.run(async (ctx) =>
      await ctx.db.insert("memoryProcessingProfiles", {
        ownerId,
        providerConnectionId: await ctx.db.insert("providerConnections", {
          ownerId,
          provider: "openrouter",
          authMethod: "oauth",
          status: "connected",
          scopes: [],
          updatedAt: 1,
        }),
        provider: "openrouter",
        extractionModel: "openai/gpt-4o-mini",
        embeddingModel: "openai/text-embedding-3-small",
        dimensions: 1536,
        policyRevision: 1,
        status: "active",
        updatedAt: 1,
      })
    )
    const conversationId = await t.run(async (ctx) =>
      await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Sensitive",
        updatedAt: 1,
      })
    )
    const messageId = await t.run(async (ctx) =>
      await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Remember my email is person@example.com",
        status: "complete",
      })
    )
    const [memoryItemId] = await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      candidates: [
        {
          canonicalKey: "contact.email",
          content: "Email is person@example.com.",
          category: "fact",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })
    const pending = await owner.query(api.memories.list, { status: "candidate" })
    expect(pending).toHaveLength(1)
    expect(
      (await owner.query(api.memories.getPersonalization)).items.some(
        (item) => item._id === memoryItemId && item.status === "candidate"
      )
    ).toBe(true)
    expect(
      (
        await t.query(internal.memoryContext.buildAgentContext, {
          ownerId,
          conversationId,
          currentMessageId: messageId,
        })
      ).selectedMemoryItemIds
    ).toEqual([])
    expect(
      await t.query(internal.memoryCapture.getLegacyMirrorItems, {
        ownerId,
        memoryItemIds: [memoryItemId],
      })
    ).toEqual([])
    await owner.mutation(api.memories.confirm, {
      memoryItemId,
      confirmSensitive: true,
    })
    expect((await owner.query(api.memories.list, { status: "active" }))[0]?.sensitivity).toBe(
      "sensitive"
    )
    expect(
      (
        await t.query(internal.memoryContext.buildAgentContext, {
          ownerId,
          conversationId,
          currentMessageId: messageId,
        })
      ).selectedMemoryItemIds
    ).toEqual([memoryItemId])
  })

  it("applies an explicit forget deletion before the next context build", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const { conversationId, messageId, profileId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
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
        updatedAt: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Forget",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Forget my response preference",
        status: "complete",
      })
      return {
        conversationId: createdConversationId,
        messageId: createdMessageId,
        profileId: createdProfileId,
      }
    })
    await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      candidates: [
        {
          canonicalKey: "preferences.response_style",
          content: "Prefers concise responses.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })
    await t.mutation(internal.memoryCapture.applyDeletions, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      deletions: [{ key: "preferences.response_style", scope: "user" }],
    })
    expect(await owner.query(api.memories.list, { status: "active" })).toEqual([])
    expect(
      (
        await t.query(internal.memoryContext.buildAgentContext, {
          ownerId,
          conversationId,
          currentMessageId: messageId,
        })
      ).selectedMemoryItemIds
    ).toEqual([])
  })

  it("migrates legacy memory idempotently with source-aware classification", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await t.run(async (ctx) => {
      await ctx.db.insert("memories", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        searchScope: `${ownerId}:user`,
        kind: "preference",
        key: "preferences.response_style",
        content: "Prefers concise replies.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
    })
    expect(
      await t.mutation(internal.memoryMigration.migrateOwner, { ownerId })
    ).toMatchObject({ migrated: 1, remaining: false })
    expect(
      await t.mutation(internal.memoryMigration.migrateOwner, { ownerId })
    ).toMatchObject({ migrated: 0, remaining: false })
    const migrated = await owner.query(api.memories.list, { status: "active" })
    expect(migrated[0]).toMatchObject({
      canonicalKey: "preferences.response_style",
      sourceSignal: "manual",
      confirmation: "confirmed",
    })
  })

  it("evicts a distinct pending item for every active capture in one batch", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|capacity-capture"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const { conversationId, messageId, profileId, pendingIds } = await t.run(
      async (ctx) => {
        const connectionId = await ctx.db.insert("providerConnections", {
          ownerId,
          provider: "openrouter",
          authMethod: "oauth",
          status: "connected",
          scopes: [],
          updatedAt: 1,
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
          updatedAt: 1,
        })
        const createdConversationId = await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: "Capacity capture",
          updatedAt: 1,
        })
        const createdMessageId = await ctx.db.insert("messages", {
          conversationId: createdConversationId,
          role: "user",
          content: "I prefer focused answers.",
          status: "complete",
        })
        const createdPendingIds = []
        for (let index = 0; index < 100; index += 1) {
          const id = await ctx.db.insert("memoryItems", {
            ownerId,
            scope: "user",
            scopeKey: "user",
            category: "fact",
            canonicalKey: `fact.seed_${index}`,
            content: `Seed fact ${index}.`,
            status: "active",
            sourceSignal: "direct_statement",
            confirmation: index < 2 ? "pending" : "confirmed",
            pinned: false,
            sensitivity: "normal",
            revision: 1,
            sourceTimestamp: 1,
            createdAt: 1,
            updatedAt: index,
          })
          if (index < 2) createdPendingIds.push(id)
        }
        return {
          conversationId: createdConversationId,
          messageId: createdMessageId,
          profileId: createdProfileId,
          pendingIds: createdPendingIds,
        }
      }
    )

    await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      candidates: [
        {
          canonicalKey: "preferences.focused_answers",
          content: "Prefers focused answers.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
        {
          canonicalKey: "preferences.concise_answers",
          content: "Prefers concise answers.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })

    const active = await owner.query(api.memories.list, { status: "active" })
    expect(active).toHaveLength(100)
    expect(
      await Promise.all(
        pendingIds.map(async (id) => (await t.run((ctx) => ctx.db.get(id)))?.status)
      )
    ).toEqual(["archived", "archived"])
  })

  it("checks duplicates before eviction and enforces capacity when confirming", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|confirm-capacity"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const candidateId = await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("memoryItems", {
          ownerId,
          scope: "user",
          scopeKey: "user",
          category: "fact",
          canonicalKey: `fact.confirm_${index}`,
          content: `Confirmed fact ${index}.`,
          status: "active",
          sourceSignal: "manual",
          confirmation: "confirmed",
          pinned: false,
          sensitivity: "normal",
          revision: 1,
          sourceTimestamp: 1,
          createdAt: 1,
          updatedAt: index,
        })
      }
      return await ctx.db.insert("memoryItems", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        category: "fact",
        canonicalKey: "fact.awaiting_confirmation",
        content: "Awaiting confirmation.",
        status: "candidate",
        sourceSignal: "inferred",
        confirmation: "pending",
        pinned: false,
        sensitivity: "normal",
        revision: 1,
        sourceTimestamp: 1,
        createdAt: 1,
        updatedAt: 1,
      })
    })

    await expect(
      owner.mutation(api.memories.create, {
        canonicalKey: "fact.confirm_0",
        content: "A duplicate must not evict another memory.",
        category: "fact",
        scope: "user",
      })
    ).rejects.toThrow("A memory with this key already exists")
    await expect(
      owner.mutation(api.memories.confirm, { memoryItemId: candidateId })
    ).rejects.toThrow("Memory capacity is full")
    expect((await t.run((ctx) => ctx.db.get(candidateId)))?.status).toBe(
      "candidate"
    )
  })

  it("keeps a manual memory active and creates a reviewable conflict proposal", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|manual-conflict"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const manualId = await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.response_style",
      content: "Prefer concise responses.",
      category: "preference",
      scope: "user",
      pinned: true,
    })
    const { conversationId, messageId, profileId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
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
        updatedAt: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Conflict",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Actually, make my answers detailed.",
        status: "complete",
      })
      return {
        conversationId: createdConversationId,
        messageId: createdMessageId,
        profileId: createdProfileId,
      }
    })
    const memoryRevision = (await t.run((ctx) => ctx.db.get(ownerId)))
      ?.memoryRevision
    await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: memoryRevision ?? 0,
      candidates: [
        {
          canonicalKey: "preferences.response_style",
          content: "Prefers detailed responses.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })

    expect(await t.run((ctx) => ctx.db.get(manualId))).toMatchObject({
      content: "Prefer concise responses.",
      status: "active",
    })
    const proposals = await owner.query(api.memories.list, {
      status: "needs_review",
    })
    expect(proposals).toHaveLength(1)
    expect(proposals[0]).toMatchObject({
      canonicalKey: "preferences.response_style",
      confirmation: "pending",
      content: "Prefers detailed responses.",
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
    })

    await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: memoryRevision ?? 0,
      candidates: [
        {
          canonicalKey: "preferences.response_style",
          content: "Prefer concise responses.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })
    const evidence = await t.run(async (ctx) =>
      await ctx.db
        .query("memoryEvidence")
        .withIndex("by_memory_item_id_and_created_at", (q) =>
          q.eq("memoryItemId", manualId)
        )
        .take(5)
    )
    expect(evidence).toHaveLength(2)
    await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: memoryRevision ?? 0,
      candidates: [
        {
          canonicalKey: "preferences.response_style",
          content: "Prefers precise responses.",
          category: "preference",
          scope: "user",
          sourceSignal: "direct_statement",
        },
      ],
    })
    const refreshedProposals = await owner.query(api.memories.list, {
      status: "needs_review",
    })
    expect(refreshedProposals).toHaveLength(1)
    expect(refreshedProposals[0]).toMatchObject({
      _id: proposals[0]._id,
      content: "Prefers precise responses.",
      revision: 2,
    })
    const proposal = proposals[0]

    await owner.mutation(api.memories.confirm, {
      memoryItemId: proposal._id,
    })
    expect(await t.run((ctx) => ctx.db.get(manualId))).toMatchObject({
      status: "archived",
    })
    expect(await owner.query(api.memories.list, { status: "active" })).toMatchObject([
      {
        _id: proposal._id,
        content: "Prefers precise responses.",
      },
    ])
    await expect(
      owner.mutation(api.memories.update, {
        memoryItemId: proposal._id,
        content: "Prefer precise responses with examples.",
      })
    ).resolves.toBeNull()
    expect(await owner.query(api.memories.list, { status: "active" })).toMatchObject([
      {
        _id: proposal._id,
        content: "Prefer precise responses with examples.",
      },
    ])
  })

  it("queues a profile-bound embedding job for a normal manual memory", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|manual-embedding"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const connectionId = await t.run(async (ctx) =>
      await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
      })
    )
    await owner.mutation(api.memories.setProcessingProfile, {
      providerConnectionId: connectionId,
    })
    const memoryItemId = await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.review_depth",
      content: "Prefer detailed code reviews.",
      category: "preference",
      scope: "user",
    })
    const profile = await t.run(async (ctx) =>
      await ctx.db
        .query("memoryProcessingProfiles")
        .withIndex("by_owner_id", (q) => q.eq("ownerId", ownerId))
        .unique()
    )
    const jobs = await t.run(async (ctx) =>
      await ctx.db
        .query("memoryJobs")
        .withIndex("by_owner_id_and_status_and_next_attempt_at", (q) =>
          q.eq("ownerId", ownerId).eq("status", "queued")
        )
        .take(5)
    )
    expect(jobs).toContainEqual(
      expect.objectContaining({
        kind: "embed",
        memoryItemId,
        profileId: profile?._id,
        profileRevision: profile?.policyRevision,
      })
    )
  })

  it("rejects a stale embedding commit after the owner disables memory", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|embedding-opt-out"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const { memoryItemId, profileId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
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
        updatedAt: 1,
      })
      const createdMemoryItemId = await ctx.db.insert("memoryItems", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        category: "preference",
        canonicalKey: "preferences.opt_out_embedding",
        content: "Do not persist an embedding after opt-out.",
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
      return { memoryItemId: createdMemoryItemId, profileId: createdProfileId }
    })

    await expect(
      t.mutation(internal.memoryCapture.applySearchDocuments, {
        ownerId,
        profileId,
        policyRevision: 1,
        documents: [
          {
            memoryItemId,
            content: "Do not persist an embedding after opt-out.",
            contentHash: "content-hash",
            itemRevision: 1,
            embedding: Array.from({ length: 1536 }, () => 0.1),
          },
        ],
      })
    ).resolves.toBe(0)
    const documents = await t.run(async (ctx) =>
      await ctx.db
        .query("memorySearchDocuments")
        .withIndex("by_memory_item_id_and_profile_revision", (q) =>
          q.eq("memoryItemId", memoryItemId).eq("profileRevision", 1)
        )
        .take(5)
    )
    expect(documents).toEqual([])
  })

  it("queues migrated direct statements for embedding under an active profile", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|migration-embedding"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const { connectionId, conversationId, messageId } = await t.run(async (ctx) => {
      const createdConnectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Migrated source",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "I prefer concise answers.",
        status: "complete",
      })
      await ctx.db.insert("memories", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        searchScope: `${ownerId}:user`,
        kind: "preference",
        key: "preferences.migrated_style",
        content: "Prefers concise answers.",
        sourceConversationId: createdConversationId,
        sourceMessageId: createdMessageId,
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      return {
        connectionId: createdConnectionId,
        conversationId: createdConversationId,
        messageId: createdMessageId,
      }
    })
    await owner.mutation(api.memories.setProcessingProfile, {
      providerConnectionId: connectionId,
    })
    await t.mutation(internal.memoryMigration.migrateOwner, { ownerId })
    const migrated = await owner.query(api.memories.list, { status: "active" })
    const migratedItem = migrated.find(
      (item) => item.canonicalKey === "preferences.migrated_style"
    )
    if (!migratedItem) throw new Error("Missing migrated memory")
    const jobs = await t.run(async (ctx) =>
      await ctx.db
        .query("memoryJobs")
        .withIndex("by_memory_item_id_and_profile_revision_and_kind", (q) =>
          q
            .eq("memoryItemId", migratedItem._id)
            .eq("profileRevision", 1)
            .eq("kind", "embed")
        )
        .take(5)
    )
    expect(jobs).toHaveLength(1)
    expect(migratedItem).toMatchObject({
      sourceConversationId: conversationId,
      sourceMessageId: messageId,
      sourceSignal: "direct_statement",
    })
  })

  it("requeues eligible active memories when the processing profile changes", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|profile-reembedding"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const memoryItemId = await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.profile_reembedding",
      content: "Use Canadian English.",
      category: "preference",
      scope: "user",
    })
    const connectionId = await t.run(async (ctx) =>
      await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
      })
    )

    await owner.mutation(api.memories.setProcessingProfile, {
      providerConnectionId: connectionId,
    })
    await owner.mutation(api.memories.setProcessingProfile, {
      providerConnectionId: connectionId,
    })
    const jobs = await t.run(async (ctx) =>
      await ctx.db
        .query("memoryJobs")
        .withIndex("by_memory_item_id_and_profile_revision_and_kind", (q) =>
          q
            .eq("memoryItemId", memoryItemId)
            .eq("profileRevision", 2)
            .eq("kind", "embed")
        )
        .take(5)
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ status: "queued" })
  })

  it("evicts the least-useful pending memory before undoing a removal at capacity", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|undo-capacity"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const now = Date.now()
    const { evictableId, removedId } = await t.run(async (ctx) => {
      let createdEvictableId: Id<"memoryItems"> | null = null
      for (let index = 0; index < 100; index += 1) {
        const id = await ctx.db.insert("memoryItems", {
          ownerId,
          scope: "user",
          scopeKey: "user",
          category: "fact",
          canonicalKey: `fact.active_${index}`,
          content: `Active fact ${index}.`,
          status: "active",
          sourceSignal: "direct_statement",
          confirmation: index === 0 ? "pending" : "confirmed",
          pinned: false,
          sensitivity: "normal",
          revision: 1,
          sourceTimestamp: 1,
          createdAt: 1,
          updatedAt: index,
        })
        if (index === 0) createdEvictableId = id
      }
      const createdRemovedId = await ctx.db.insert("memoryItems", {
        ownerId,
        scope: "user",
        scopeKey: "user",
        category: "fact",
        canonicalKey: "fact.restore_me",
        content: "Restore me.",
        status: "removed",
        sourceSignal: "manual",
        confirmation: "confirmed",
        pinned: false,
        sensitivity: "normal",
        revision: 1,
        sourceTimestamp: 1,
        removedAt: now,
        undoExpiresAt: now + 30_000,
        createdAt: 1,
        updatedAt: 1,
      })
      if (!createdEvictableId) throw new Error("Missing evictable memory")
      return { evictableId: createdEvictableId, removedId: createdRemovedId }
    })

    await owner.mutation(api.memories.undoRemove, { memoryItemId: removedId })
    expect(await t.run((ctx) => ctx.db.get(evictableId))).toMatchObject({
      status: "archived",
    })
    expect(await t.run((ctx) => ctx.db.get(removedId))).toMatchObject({
      status: "active",
    })
    expect(await owner.query(api.memories.list, { status: "active" })).toHaveLength(
      100
    )
  })

  it("does not recreate a removed memory while its tombstone is active", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|removed-key"))
    await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const memoryItemId = await owner.mutation(api.memories.create, {
      canonicalKey: "preferences.deleted_style",
      content: "Prefers a deleted style.",
      category: "preference",
      scope: "user",
    })
    await owner.mutation(api.memories.remove, { memoryItemId })
    await expect(
      owner.mutation(api.memories.create, {
        canonicalKey: "preferences.deleted_style",
        content: "Attempts to recreate the deleted style.",
        category: "preference",
        scope: "user",
      })
    ).rejects.toThrow("Memory key is unavailable until its deletion window expires")
  })

  it("forgets a candidate before it can be confirmed", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|candidate-forget"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const { conversationId, messageId, profileId } = await t.run(async (ctx) => {
      const connectionId = await ctx.db.insert("providerConnections", {
        ownerId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
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
        updatedAt: 1,
      })
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Forget candidate",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Do not remember this inferred preference.",
        status: "complete",
      })
      return {
        conversationId: createdConversationId,
        messageId: createdMessageId,
        profileId: createdProfileId,
      }
    })
    await t.mutation(internal.memoryCapture.commitCandidates, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      candidates: [
        {
          canonicalKey: "preferences.inferred_style",
          content: "May prefer detailed answers.",
          category: "preference",
          scope: "user",
          sourceSignal: "inferred",
        },
      ],
    })
    await t.mutation(internal.memoryCapture.applyDeletions, {
      ownerId,
      conversationId,
      messageId,
      profileId,
      policyRevision: 1,
      memoryRevision: 1,
      deletions: [{ key: "preferences.inferred_style", scope: "user" }],
    })
    expect(await owner.query(api.memories.list, { status: "candidate" })).toEqual([])
  })

  it("runs candidate expiry, review, and undo-window purging through hourly retention", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|hourly-retention"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const now = Date.now()
    const { candidateId, reviewId, removedId } = await t.run(async (ctx) => {
      const base = {
        ownerId,
        scope: "user" as const,
        scopeKey: "user",
        category: "fact" as const,
        sourceSignal: "inferred" as const,
        confirmation: "pending" as const,
        pinned: false,
        sensitivity: "normal" as const,
        revision: 1,
        sourceTimestamp: 1,
        createdAt: 1,
      }
      const createdCandidateId = await ctx.db.insert("memoryItems", {
        ...base,
        canonicalKey: "fact.expired_candidate",
        content: "Expired candidate.",
        status: "candidate",
        expiresAt: now - 1,
        updatedAt: 1,
      })
      const createdReviewId = await ctx.db.insert("memoryItems", {
        ...base,
        canonicalKey: "fact.stale_pending",
        content: "Stale pending fact.",
        status: "active",
        updatedAt: now - 181 * 24 * 60 * 60 * 1_000,
      })
      const createdRemovedId = await ctx.db.insert("memoryItems", {
        ...base,
        canonicalKey: "fact.expired_undo",
        content: "Expired undo fact.",
        status: "removed",
        removedAt: now - 31_000,
        undoExpiresAt: now - 1,
        updatedAt: 1,
      })
      return {
        candidateId: createdCandidateId,
        reviewId: createdReviewId,
        removedId: createdRemovedId,
      }
    })

    await expect(t.mutation(internal.memoryRetention.run, { now })).resolves.toMatchObject({
      candidates: 1,
      reviews: 1,
      purged: 1,
    })
    expect((await t.run((ctx) => ctx.db.get(candidateId)))?.status).toBe("archived")
    expect((await t.run((ctx) => ctx.db.get(reviewId)))?.status).toBe("needs_review")
    expect(await t.run((ctx) => ctx.db.get(removedId))).toBeNull()
  })
})
