import { convexTest } from "convex-test"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

const identity = (tokenIdentifier: string) => ({
  subject: tokenIdentifier,
  tokenIdentifier,
})

afterEach(() => vi.useRealTimers())

describe("projects and conversations", () => {
  it("renames and deletes only owned projects without deleting their chats", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    await ben.mutation(api.users.syncCurrent)
    const projectId = await ada.mutation(api.projects.create, { name: "Work" })
    const conversationId = await t.run(
      async (ctx) =>
        await ctx.db.insert("conversations", {
          ownerId: adaId,
          projectId,
          status: "active",
          title: "Keep me",
          updatedAt: 1,
        })
    )

    await expect(
      ben.mutation(api.projects.rename, { name: "Stolen", projectId })
    ).rejects.toThrow("Project unavailable")
    await ada.mutation(api.projects.rename, {
      name: " Client work ",
      projectId,
    })
    await expect(ada.query(api.projects.list)).resolves.toMatchObject([
      { name: "Client work" },
    ])

    await expect(
      ben.mutation(api.projects.remove, { projectId })
    ).rejects.toThrow("Project unavailable")
    await ada.mutation(api.projects.remove, { projectId })
    await expect(ada.query(api.projects.list)).resolves.toEqual([])
    expect(
      await ada.query(api.conversations.get, { conversationId })
    ).not.toHaveProperty("projectId")
  })

  it("invalidates in-flight memory capture and history work when removing a project", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|project-memory-race"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    await owner.mutation(api.memories.setEnabled, { enabled: true })
    await owner.mutation(api.memories.setHistoryEnabled, { enabled: true })
    const projectId = await owner.mutation(api.projects.create, {
      name: "Memory race project",
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
        projectId,
        status: "active",
        title: "Project capture",
        memoryMode: "standard",
        updatedAt: 1,
      })
      const createdMessageId = await ctx.db.insert("messages", {
        conversationId: createdConversationId,
        role: "user",
        content: "Remember this project detail.",
        status: "complete",
      })
      return {
        conversationId: createdConversationId,
        messageId: createdMessageId,
        profileId: createdProfileId,
      }
    })
    const beforeRemoval = await t.run(async (ctx) => await ctx.db.get(ownerId))
    expect(beforeRemoval).toMatchObject({
      memoryHistoryRevision: 1,
      memoryRevision: 2,
    })

    await owner.mutation(api.projects.remove, { projectId })
    const afterRemoval = await t.run(async (ctx) => await ctx.db.get(ownerId))
    expect(afterRemoval).toMatchObject({
      memoryHistoryRevision: 2,
      memoryRevision: 3,
    })
    expect((await t.run((ctx) => ctx.db.get(conversationId)))?.projectId).toBeUndefined()

    await expect(
      t.mutation(internal.memoryCapture.commitCandidates, {
        ownerId,
        conversationId,
        messageId,
        profileId,
        policyRevision: 1,
        memoryRevision: 2,
        candidates: [
          {
            canonicalKey: "project.stale_capture",
            content: "Must not become personal memory.",
            category: "fact",
            scope: "user",
            sourceSignal: "direct_statement",
          },
        ],
      })
    ).resolves.toEqual([])
    await expect(
      t.mutation(internal.memoryHistory.applySummary, {
        ownerId,
        conversationId,
        historyRevision: 1,
        content: "Must not become personal history.",
      })
    ).resolves.toBe(false)
  })

  it("rejects anonymous callers and scopes data to the authenticated owner", async () => {
    const t = convexTest(schema, modules)
    await expect(t.query(api.projects.list)).rejects.toThrow(
      "Not authenticated"
    )

    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    const benId = await ben.mutation(api.users.syncCurrent)
    const first = await ada.mutation(api.projects.create, { name: " First " })
    const second = await ada.mutation(api.projects.create, { name: "Second" })
    const hidden = await ben.mutation(api.projects.create, { name: "Private" })

    expect(
      (await ada.query(api.projects.list)).map((project) => project.name)
    ).toEqual(["Second", "First"])

    const conversationId = await t.run(
      async (ctx) =>
        await ctx.db.insert("conversations", {
          ownerId: adaId,
          projectId: first,
          status: "active",
          title: "Ada chat",
          updatedAt: 1,
        })
    )
    await t.run(
      async (ctx) =>
        await ctx.db.insert("conversations", {
          ownerId: benId,
          projectId: hidden,
          status: "active",
          title: "Ben chat",
          updatedAt: 2,
        })
    )

    await expect(
      ben.query(api.conversations.get, { conversationId })
    ).resolves.toBeNull()
    await expect(
      ben.query(api.conversations.listMessages, { conversationId })
    ).resolves.toEqual([])
    expect(
      (await ada.query(api.conversations.listRecent, {})).map(
        (item) => item._id
      )
    ).toEqual([conversationId])
    expect(
      await ada.query(api.conversations.listRecent, { projectId: second })
    ).toEqual([])
    await ada.mutation(api.conversations.moveToProject, {
      conversationId,
      projectId: second,
    })
    await expect(
      ada.query(api.conversations.get, { conversationId })
    ).resolves.toMatchObject({ projectId: second })
    await expect(
      ben.mutation(api.conversations.moveToProject, {
        conversationId,
        projectId: hidden,
      })
    ).rejects.toThrow("Conversation unavailable")
  })

  it("loads an owned project outside the capped sidebar list", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    await ben.mutation(api.users.syncCurrent)
    const projectId = await t.run(
      async (ctx) =>
        await ctx.db.insert("projects", {
          name: "Old project",
          ownerId: adaId,
          updatedAt: 0,
        })
    )
    await t.run(async (ctx) => {
      for (let index = 1; index <= 50; index += 1)
        await ctx.db.insert("projects", {
          name: `Project ${index}`,
          ownerId: adaId,
          updatedAt: index,
        })
    })

    expect(
      (await ada.query(api.projects.list)).some(
        (project) => project._id === projectId
      )
    ).toBe(false)
    await expect(
      ada.query(api.projects.get, { projectId })
    ).resolves.toMatchObject({ name: "Old project" })
    await expect(ben.query(api.projects.get, { projectId })).resolves.toBeNull()
  })

  it("adds uploaded files only to an owned project", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    await ada.mutation(api.users.syncCurrent)
    await ben.mutation(api.users.syncCurrent)
    const projectId = await ada.mutation(api.projects.create, { name: "Work" })
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(["notes"], { type: "text/plain" }))
    )
    const draftAttachmentId = await ada.mutation(api.attachments.register, {
      name: "notes.txt",
      storageId,
    })

    await expect(
      ben.mutation(api.projects.addSources, {
        projectId,
        sourceDraftAttachmentIds: [draftAttachmentId],
      })
    ).rejects.toThrow("Project unavailable")
    await ada.mutation(api.projects.addSources, {
      projectId,
      sourceDraftAttachmentIds: [draftAttachmentId],
    })

    await expect(
      ada.query(api.projects.listSources, { projectId })
    ).resolves.toMatchObject([
      { kind: "file", name: "notes.txt", size: 5, url: expect.any(String) },
    ])
    await expect(
      t.run(async (ctx) => await ctx.db.get(draftAttachmentId))
    ).resolves.toBeNull()
  })

  it("creates an owned conversation slug and persists its messages", async () => {
    vi.useFakeTimers()
    const t = convexTest(schema, modules)
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    await ben.mutation(api.users.syncCurrent)
    const sourceStorageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["project brief"], { type: "application/pdf" })
        )
    )
    const sourceDraftAttachmentId = await ada.mutation(
      api.attachments.register,
      { name: "brief.pdf", storageId: sourceStorageId }
    )
    const projectId = await ada.mutation(api.projects.create, {
      instructions: "Use TypeScript and include a focused verification step.",
      memoryScope: "project_only",
      name: "Work",
      sourceDraftAttachmentIds: [sourceDraftAttachmentId],
      sourceLinks: ["https://docs.example.com/guide#setup"],
    })
    await expect(
      ada.query(api.projects.listSources, { projectId })
    ).resolves.toMatchObject([
      { kind: "file", name: "brief.pdf", url: expect.any(String) },
      {
        kind: "link",
        name: "docs.example.com",
        url: "https://docs.example.com/guide",
      },
    ])
    await expect(
      ben.query(api.projects.listSources, { projectId })
    ).resolves.toEqual([])
    const connectionId = await t.run(
      async (ctx) =>
        await ctx.db.insert("providerConnections", {
          ownerId: adaId,
          provider: "openrouter",
          authMethod: "oauth",
          status: "connected",
          scopes: ["responses"],
          updatedAt: 1,
        })
    )
    await t.run(
      async (ctx) =>
        await ctx.db.insert("providerCredentials", {
          connectionId,
          ciphertext: "encrypted-token",
          iv: "initialization-vector",
          updatedAt: 1,
        })
    )
    await ada.mutation(api.users.updatePreferences, {
      defaultModel: null,
      language: "fr",
      intelligenceLevel: "deep",
      responseDetail: "concise",
      userMessageBubbleColor: "default",
    })
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(["image"], { type: "image/png" }))
    )
    const draftAttachmentId = await ada.mutation(api.attachments.register, {
      name: " example.png ",
      storageId,
    })
    const generatedStorageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(["generated"], { type: "image/webp" }))
    )

    const conversationId = await ada.mutation(api.conversations.start, {
      content: "  Explain indexed database lookups.  ",
      draftAttachmentIds: [draftAttachmentId],
      model: "openai/gpt-5",
      outputMode: "text",
      projectId,
      providerConnectionId: connectionId,
      reasoningEffort: "high",
    })
    const conversation = await ada.query(api.conversations.get, {
      conversationId,
    })
    expect(conversation).toMatchObject({
      _id: conversationId,
      model: "openai/gpt-5",
      outputMode: "text",
      ownerId: adaId,
      projectId,
      providerConnectionId: connectionId,
      reasoningEffort: "high",
      title: "Explain indexed database lookups.",
    })
    const messages = await ada.query(api.conversations.listMessages, {
      conversationId,
    })
    expect(messages).toMatchObject([
      {
        attachments: [
          {
            contentType: "application/octet-stream",
            name: "example.png",
            size: 5,
            storageId,
            url: expect.any(String),
          },
        ],
        content: "Explain indexed database lookups.",
        model: "openai/gpt-5",
        outputMode: "text",
        provider: "openrouter",
        reasoningEffort: "high",
        role: "user",
      },
      {
        content: "",
        model: "openai/gpt-5",
        outputMode: "text",
        provider: "openrouter",
        reasoningEffort: "high",
        role: "assistant",
        status: "pending",
      },
    ])
    const responseContext = await t.query(
      internal.conversations.getOpenRouterResponseContext,
      {
        assistantMessageId: messages[1]._id,
        conversationId,
      }
    )
    expect(responseContext.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Reply in French"),
    })
    expect(responseContext.outputMode).toBe("text")
    expect(responseContext.messages[0].content).toContain("Be concise")
    expect(responseContext.messages[0].content).toContain(
      "Use TypeScript and include a focused verification step."
    )
    expect(responseContext.messages[0].content).toContain(
      "Always consider the attached project files"
    )
    expect(responseContext.messages[0].content).toContain('"brief.pdf"')
    expect(responseContext.memorySearchScopes).toEqual([
      `${adaId}:project:${projectId}`,
    ])
    expect(responseContext.hasProjectLinks).toBe(true)
    expect(responseContext.messages[1]).toMatchObject({
      attachments: [
        {
          contentType: "application/octet-stream",
          name: "brief.pdf",
          size: 13,
          storageId: sourceStorageId,
          url: expect.any(String),
        },
      ],
      content: expect.stringContaining("https://docs.example.com/guide"),
      role: "user",
    })
    expect(responseContext.messages[2]).toMatchObject({
      role: "user",
      content: "Explain indexed database lookups.",
      attachments: [
        {
          contentType: "application/octet-stream",
          name: "example.png",
          size: 5,
          storageId,
          url: expect.any(String),
        },
      ],
    })

    const uiPayload = JSON.stringify({
      kind: "stats",
      stats: [{ label: "Index scans", value: 3 }],
    })
    await t.mutation(internal.conversations.finishOpenRouterResponse, {
      assistantMessageId: messages[1]._id,
      attachments: [
        {
          contentType: "image/webp",
          name: "generated-image.webp",
          size: 9,
          storageId: generatedStorageId,
        },
      ],
      content: "",
      contextTokens: 1_234,
      failed: false,
      uiPayload,
    })
    await expect(
      ada.query(api.conversations.listMessages, { conversationId })
    ).resolves.toMatchObject([
      {},
      {
        attachments: [
          {
            contentType: "image/webp",
            name: "generated-image.webp",
            size: 9,
            storageId: generatedStorageId,
            url: expect.any(String),
          },
        ],
        contextTokens: 1_234,
        status: "complete",
        uiPayload,
      },
    ])

    await ada.mutation(api.conversations.send, {
      conversationId,
      content: "Show an example.",
      model: "anthropic/claude-sonnet",
    })
    await expect(
      ada.query(api.conversations.get, { conversationId })
    ).resolves.toMatchObject({ model: "anthropic/claude-sonnet" })
    const nextMessages = await ada.query(api.conversations.listMessages, {
      conversationId,
    })
    expect(nextMessages).toHaveLength(4)
    const nextContext = await t.query(
      internal.conversations.getOpenRouterResponseContext,
      {
        assistantMessageId: nextMessages[3]._id,
        conversationId,
      }
    )
    expect(nextContext.messages[3]?.content).toContain(uiPayload)
    await expect(
      ben.mutation(api.conversations.send, {
        conversationId,
        content: "Read Ada's chat",
        model: "openai/gpt-5",
      })
    ).rejects.toThrow("Conversation unavailable")
    await expect(
      ben.mutation(api.conversations.start, {
        content: "Use Ada's provider",
        model: "openai/gpt-5",
        providerConnectionId: connectionId,
      })
    ).rejects.toThrow("Provider connection unavailable")
  })

  it("returns bounded recent conversations in updated order", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)

    await t.run(async (ctx) => {
      for (let index = 0; index <= 30; index += 1) {
        await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          title: `Chat ${index}`,
          updatedAt: index,
        })
      }
    })

    const recent = await owner.query(api.conversations.listRecent, {
      limit: 100,
    })
    expect(recent).toHaveLength(30)
    expect(recent[0]?.title).toBe("Chat 30")
    expect(recent.at(-1)?.title).toBe("Chat 1")
  })

  it("lists only chats outside projects for the sidebar recents", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|owner"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const projectId = await owner.mutation(api.projects.create, {
      name: "Website redesign",
    })

    await t.run(async (ctx) => {
      await ctx.db.insert("conversations", {
        ownerId,
        projectId,
        status: "active",
        title: "Project chat",
        updatedAt: 2,
      })
      await ctx.db.insert("conversations", {
        ownerId,
        status: "active",
        title: "Outside chat",
        updatedAt: 1,
      })
    })

    expect(
      await owner.query(api.conversations.listRecent, {
        unassignedOnly: true,
      })
    ).toEqual([expect.objectContaining({ title: "Outside chat" })])
  })

  it("separates text and image histories across recent, project, and archive views", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity(identity("clerk|workspace-owner"))
    const otherOwner = t.withIdentity(identity("clerk|workspace-other"))
    const ownerId = await owner.mutation(api.users.syncCurrent)
    const otherOwnerId = await otherOwner.mutation(api.users.syncCurrent)
    const projectId = await owner.mutation(api.projects.create, {
      name: "Workspace project",
    })

    await t.run(async (ctx) => {
      const conversations = [
        { title: "Legacy unassigned", updatedAt: 8 },
        { title: "Text unassigned", updatedAt: 7, outputMode: "text" as const },
        {
          title: "Image unassigned",
          updatedAt: 9,
          outputMode: "image" as const,
        },
        { title: "Legacy project", updatedAt: 6, projectId },
        {
          title: "Text project",
          updatedAt: 5,
          outputMode: "text" as const,
          projectId,
        },
        {
          title: "Image project",
          updatedAt: 4,
          outputMode: "image" as const,
          projectId,
        },
      ]

      for (const conversation of conversations) {
        await ctx.db.insert("conversations", {
          ownerId,
          status: "active",
          ...conversation,
        })
      }

      for (const conversation of [
        { title: "Legacy archived", updatedAt: 3 },
        { title: "Text archived", updatedAt: 2, outputMode: "text" as const },
        { title: "Image archived", updatedAt: 1, outputMode: "image" as const },
      ]) {
        await ctx.db.insert("conversations", {
          ownerId,
          status: "archived",
          ...conversation,
        })
      }

      await ctx.db.insert("conversations", {
        ownerId: otherOwnerId,
        status: "active",
        title: "Other owner's image",
        updatedAt: 10,
        outputMode: "image",
      })
    })

    const titles = async (args: {
      limit?: number
      outputMode?: "image" | "text"
      projectId?: string
      status?: "active" | "archived"
      unassignedOnly?: boolean
    }) =>
      (await owner.query(api.conversations.listRecent, args)).map(
        (conversation) => conversation.title
      )

    await expect(titles({ outputMode: "text" })).resolves.toEqual([
      "Legacy unassigned",
      "Text unassigned",
      "Legacy project",
      "Text project",
    ])
    await expect(titles({ outputMode: "image" })).resolves.toEqual([
      "Image unassigned",
      "Image project",
    ])
    await expect(titles({ limit: 2, outputMode: "text" })).resolves.toEqual([
      "Legacy unassigned",
      "Text unassigned",
    ])
    await expect(
      titles({ outputMode: "text", unassignedOnly: true })
    ).resolves.toEqual(["Legacy unassigned", "Text unassigned"])
    await expect(
      titles({ outputMode: "image", unassignedOnly: true })
    ).resolves.toEqual(["Image unassigned"])
    await expect(titles({ outputMode: "text", projectId })).resolves.toEqual([
      "Legacy project",
      "Text project",
    ])
    await expect(titles({ outputMode: "image", projectId })).resolves.toEqual([
      "Image project",
    ])
    await expect(
      titles({ outputMode: "text", status: "archived" })
    ).resolves.toEqual(["Legacy archived", "Text archived"])
    await expect(
      titles({ outputMode: "image", status: "archived" })
    ).resolves.toEqual(["Image archived"])
  })

  it("archives, lists archived, restores, and deletes owned chats", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity(identity("clerk|ada"))
    const ben = t.withIdentity(identity("clerk|ben"))
    const adaId = await ada.mutation(api.users.syncCurrent)
    await ben.mutation(api.users.syncCurrent)
    const projectId = await ada.mutation(api.projects.create, { name: "Work" })

    const activeId = await t.run(
      async (ctx) =>
        await ctx.db.insert("conversations", {
          ownerId: adaId,
          projectId,
          status: "active",
          title: "Keep me",
          updatedAt: 2,
        })
    )
    const archiveId = await t.run(
      async (ctx) =>
        await ctx.db.insert("conversations", {
          ownerId: adaId,
          projectId,
          status: "active",
          title: "Archive me",
          updatedAt: 3,
        })
    )
    const messageId = await t.run(
      async (ctx) =>
        await ctx.db.insert("messages", {
          conversationId: archiveId,
          role: "user",
          content: "secret",
          status: "complete",
        })
    )

    await ada.mutation(api.conversations.archive, { conversationId: archiveId })
    expect(
      (await ada.query(api.conversations.listRecent, {})).map(
        (item) => item._id
      )
    ).toEqual([activeId])
    expect(
      (
        await ada.query(api.conversations.listRecent, {
          projectId,
          status: "archived",
        })
      ).map((item) => item._id)
    ).toEqual([archiveId])
    await expect(
      ben.mutation(api.conversations.archive, { conversationId: archiveId })
    ).rejects.toThrow("Conversation unavailable")

    await ada.mutation(api.conversations.unarchive, {
      conversationId: archiveId,
    })
    expect(
      (await ada.query(api.conversations.listRecent, {})).map(
        (item) => item._id
      )
    ).toEqual([archiveId, activeId])

    await ada.mutation(api.conversations.remove, { conversationId: archiveId })
    expect(
      (await ada.query(api.conversations.listRecent, {})).map(
        (item) => item._id
      )
    ).toEqual([activeId])
    await expect(
      ada.query(api.conversations.get, { conversationId: archiveId })
    ).resolves.toBeNull()
    await expect(
      t.run(async (ctx) => await ctx.db.get(messageId))
    ).resolves.toBeNull()
    await expect(
      ben.mutation(api.conversations.remove, { conversationId: activeId })
    ).rejects.toThrow("Conversation unavailable")
  })
})
