import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

const identity = (tokenIdentifier: string) => ({
  subject: tokenIdentifier,
  tokenIdentifier,
})

describe("durable memories", () => {
  it("is opt-in and keeps settings, edits, and deletion owner-scoped", async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.memories.getSettings)).rejects.toThrow(
      "Not authenticated"
    )
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    const benId = await ben.mutation(api.users.syncCurrent)
    await expect(ada.query(api.memories.getSettings)).resolves.toEqual({
      enabled: false,
      memories: [],
    })
    await ada.mutation(api.memories.setEnabled, { enabled: true })

    const [adaMemoryId, benMemoryId] = await t.run(async (ctx) => {
      const adaMemory = await ctx.db.insert("memories", {
        ownerId: adaId,
        scope: "user",
        scopeKey: "user",
        searchScope: `${adaId}:user`,
        kind: "preference",
        key: "preferences.response_style",
        content: "Prefers concise replies.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      const benMemory = await ctx.db.insert("memories", {
        ownerId: benId,
        scope: "user",
        scopeKey: "user",
        searchScope: `${benId}:user`,
        kind: "preference",
        key: "preferences.private",
        content: "Ben's private preference.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      return [adaMemory, benMemory] as const
    })

    expect((await ada.query(api.memories.getSettings)).memories).toMatchObject([
      { _id: adaMemoryId, content: "Prefers concise replies." },
    ])
    await expect(
      ada.mutation(api.memories.remove, { memoryId: benMemoryId })
    ).rejects.toThrow("Memory unavailable")
    await ada.mutation(api.memories.update, {
      memoryId: adaMemoryId,
      content: "  Prefers concise, technical replies.  ",
    })
    expect(
      (await ada.query(api.memories.getSettings)).memories[0]?.content
    ).toBe("Prefers concise, technical replies.")
    await ada.mutation(api.memories.clear)
    expect((await ada.query(api.memories.getSettings)).memories).toEqual([])
    expect((await ben.query(api.memories.getSettings)).memories).toHaveLength(1)
  })

  it("rejects stale extraction, skips unembedded facts, and enforces the cap", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const projectId = await owner.mutation(api.projects.create, {
      name: "Work",
    })
    const { conversationId, newer, older } = await t.run(async (ctx) => {
      const createdConversationId = await ctx.db.insert("conversations", {
        ownerId,
        projectId,
        status: "active",
        title: "Memory test",
        updatedAt: 1,
      })
      const olderId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "I prefer detailed replies",
        status: "complete",
      })
      const newerId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Correction: I prefer concise replies",
        status: "complete",
      })
      return {
        conversationId: createdConversationId,
        older: (await ctx.db.get(olderId))!,
        newer: (await ctx.db.get(newerId))!,
      }
    })

    const write = async (
      message: typeof newer,
      content: string,
      memoryRevision: number,
      includeUnembeddedFact = false
    ) =>
      await t.mutation(internal.memories.upsertExtracted, {
        deletions: [],
        memories: [
          {
            content,
            key: "preferences.response_style",
            kind: "preference",
            scope: "user",
          },
          ...(includeUnembeddedFact
            ? [
                {
                  content: "The project uses Convex.",
                  key: "project.stack",
                  kind: "fact" as const,
                  scope: "project" as const,
                },
              ]
            : []),
        ],
        memoryRevision,
        ownerId,
        projectId,
        sourceConversationId: conversationId,
        sourceMessageCreatedAt: message._creationTime,
        sourceMessageId: message._id,
      })

    await write(newer, "Prefers concise replies.", 1, true)
    await write(older, "Prefers detailed replies.", 1)
    expect(
      (await owner.query(api.memories.getSettings)).memories
    ).toMatchObject([
      {
        content: "Prefers concise replies.",
        key: "preferences.response_style",
      },
    ])

    await owner.mutation(api.memories.clear)
    await t.run(async (ctx) => {
      for (let index = 0; index < 100; index += 1) {
        await ctx.db.insert("memories", {
          ownerId,
          scope: "user",
          scopeKey: "user",
          searchScope: `${ownerId}:user`,
          kind: "preference",
          key: `preferences.item_${index}`,
          content: `Preference ${index}`,
          sourceTimestamp: newer._creationTime,
          updatedAt: index,
        })
      }
    })
    await write(newer, "Prefers concise replies.", 2)
    expect((await owner.query(api.memories.getSettings)).memories).toHaveLength(
      100
    )
  })

  it("re-checks opt-out before a scheduled re-embedding reads credentials", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const memoryId = await t.run(
      async (ctx) =>
        await ctx.db.insert("memories", {
          ownerId,
          scope: "user",
          scopeKey: "user",
          searchScope: `${ownerId}:user`,
          kind: "fact",
          key: "profile.editor",
          content: "Uses VS Code.",
          sourceTimestamp: 1,
          updatedAt: 1,
        })
    )
    await expect(
      t.query(internal.memories.getEmbeddingContext, {
        content: "Uses VS Code.",
        memoryId,
      })
    ).resolves.toBeNull()
  })

  it("limits extraction deletion and hydration to the owner and active project", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    const benId = await ben.mutation(api.users.syncCurrent)
    await ada.mutation(api.memories.setEnabled, { enabled: true })
    const activeProjectId = await ada.mutation(api.projects.create, {
      name: "Active",
    })
    const otherProjectId = await ada.mutation(api.projects.create, {
      name: "Other",
    })
    const setup = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId: adaId,
        projectId: activeProjectId,
        status: "active",
        title: "Forget test",
        updatedAt: 1,
      })
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Forget the project framework",
        status: "complete",
      })
      const message = (await ctx.db.get(messageId))!
      const targetId = await ctx.db.insert("memories", {
        ownerId: adaId,
        projectId: activeProjectId,
        scope: "project",
        scopeKey: `project:${activeProjectId}`,
        searchScope: `${adaId}:project:${activeProjectId}`,
        kind: "preference",
        key: "project.framework",
        content: "Active project uses Convex.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      const otherProjectMemoryId = await ctx.db.insert("memories", {
        ownerId: adaId,
        projectId: otherProjectId,
        scope: "project",
        scopeKey: `project:${otherProjectId}`,
        searchScope: `${adaId}:project:${otherProjectId}`,
        kind: "preference",
        key: "project.framework",
        content: "Other project uses React.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      const benMemoryId = await ctx.db.insert("memories", {
        ownerId: benId,
        scope: "user",
        scopeKey: "user",
        searchScope: `${benId}:user`,
        kind: "preference",
        key: "project.framework",
        content: "Ben uses Vue.",
        sourceTimestamp: 1,
        updatedAt: 1,
      })
      return {
        benMemoryId,
        conversationId,
        message,
        otherProjectMemoryId,
        targetId,
      }
    })

    await t.mutation(internal.memories.upsertExtracted, {
      deletions: [{ key: "project.framework", scope: "project" }],
      memories: [],
      memoryRevision: 1,
      ownerId: adaId,
      projectId: activeProjectId,
      sourceConversationId: setup.conversationId,
      sourceMessageCreatedAt: setup.message._creationTime,
      sourceMessageId: setup.message._id,
    })
    await expect(
      t.run(async (ctx) => await ctx.db.get(setup.targetId))
    ).resolves.toBeNull()
    await expect(
      t.run(async (ctx) => await ctx.db.get(setup.otherProjectMemoryId))
    ).resolves.not.toBeNull()
    await expect(
      t.run(async (ctx) => await ctx.db.get(setup.benMemoryId))
    ).resolves.not.toBeNull()
    await expect(
      t.query(internal.memories.hydrateSearchResults, {
        memoryIds: [setup.otherProjectMemoryId, setup.benMemoryId],
        ownerId: adaId,
        projectId: activeProjectId,
      })
    ).resolves.toEqual([])
  })

  it("invalidates in-flight extraction after manual memory controls", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const source = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Revision test",
        updatedAt: 1,
      })
      const messageId = await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Remember that I prefer concise replies",
        status: "complete",
      })
      return {
        conversationId,
        message: (await ctx.db.get(messageId))!,
      }
    })
    const insertPreference = async (content: string) =>
      await t.run(
        async (ctx) =>
          await ctx.db.insert("memories", {
            ownerId,
            scope: "user",
            scopeKey: "user",
            searchScope: `${ownerId}:user`,
            kind: "preference",
            key: "preferences.response_style",
            content,
            sourceTimestamp: 1,
            updatedAt: 1,
          })
      )
    const extract = async (memoryRevision: number, content: string) =>
      await t.mutation(internal.memories.upsertExtracted, {
        deletions: [],
        memories: [
          {
            content,
            key: "preferences.response_style",
            kind: "preference",
            scope: "user",
          },
        ],
        memoryRevision,
        ownerId,
        sourceConversationId: source.conversationId,
        sourceMessageCreatedAt: source.message._creationTime,
        sourceMessageId: source.message._id,
      })

    const removedId = await insertPreference("Old value")
    await owner.mutation(api.memories.remove, { memoryId: removedId })
    await extract(1, "Resurrected after remove")
    expect((await owner.query(api.memories.getSettings)).memories).toEqual([])

    await insertPreference("Clear me")
    await owner.mutation(api.memories.clear)
    await extract(2, "Resurrected after clear")
    expect((await owner.query(api.memories.getSettings)).memories).toEqual([])

    const editedId = await insertPreference("Edit me")
    await owner.mutation(api.memories.update, {
      content: "Manual edit wins",
      memoryId: editedId,
    })
    await extract(3, "Stale extraction loses")
    expect(
      (await owner.query(api.memories.getSettings)).memories[0]?.content
    ).toBe("Manual edit wins")

    await owner.mutation(api.memories.setEnabled, { enabled: false })
    await extract(5, "Disabled memory write")
    expect(
      (await owner.query(api.memories.getSettings)).memories[0]?.content
    ).toBe("Manual edit wins")
  })

  it("uses the newest project preference over user and older duplicates", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    const projectId = await owner.mutation(api.projects.create, {
      name: "Work",
    })
    const setup = await t.run(async (ctx) => {
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
      const conversationId = await ctx.db.insert("conversations", {
        ownerId,
        projectId,
        status: "active",
        title: "Preference context",
        providerConnectionId: connectionId,
        model: "openai/gpt-5",
        updatedAt: 1,
      })
      await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "How should you answer?",
        status: "complete",
      })
      const assistantMessageId = await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: "",
        status: "pending",
        model: "openai/gpt-5",
      })
      for (const [scope, content, updatedAt] of [
        ["user", "User older", 1],
        ["user", "User newest", 2],
        ["project", "Project older", 3],
        ["project", "Project newest", 4],
      ] as const) {
        const scopeKey = scope === "user" ? "user" : `project:${projectId}`
        await ctx.db.insert("memories", {
          ownerId,
          ...(scope === "project" ? { projectId } : {}),
          scope,
          scopeKey,
          searchScope: `${ownerId}:${scopeKey}`,
          kind: "preference",
          key: "preferences.response_style",
          content,
          sourceTimestamp: updatedAt,
          updatedAt,
        })
      }
      return { assistantMessageId, conversationId }
    })

    const context = await t.query(
      internal.conversations.getOpenRouterResponseContext,
      setup
    )
    expect(context.memoryPreferences).toEqual(["Project newest"])
  })
})
