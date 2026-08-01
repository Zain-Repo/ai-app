import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
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
