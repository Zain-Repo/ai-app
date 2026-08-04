import { anyApi } from "convex/server"
import { convexTest } from "convex-test"
import { expect, it } from "vitest"
import migrationsComponent from "@convex-dev/migrations/test"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

const identity = (tokenIdentifier: string) => ({
  subject: tokenIdentifier,
  tokenIdentifier,
})

it("lists only owned assets and removes them with their origins", async () => {
  const t = convexTest(schema, modules)
  const ada = t.withIdentity(identity("clerk|library-ada"))
  const ben = t.withIdentity(identity("clerk|library-ben"))
  const adaId = await ada.mutation(api.users.syncCurrent)
  await ben.mutation(api.users.syncCurrent)
  const connectionId = await t.run(
    async (ctx) =>
      await ctx.db.insert("providerConnections", {
        ownerId: adaId,
        provider: "openrouter",
        authMethod: "oauth",
        status: "connected",
        scopes: [],
        updatedAt: 1,
      })
  )
  const uploadStorageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(["upload"]))
  )
  const draftAttachmentId = await ada.mutation(api.attachments.register, {
    name: "reference.png",
    storageId: uploadStorageId,
  })
  const conversationId = await ada.mutation(api.conversations.start, {
    content: "Create an image",
    draftAttachmentIds: [draftAttachmentId],
    model: "openai/gpt-image-1",
    outputMode: "image",
    providerConnectionId: connectionId,
  })

  const firstPage = await ada.query(anyApi.library.list, {
    paginationOpts: { cursor: null, numItems: 10 },
  })
  expect(firstPage.page).toMatchObject([
    {
      category: "upload",
      kind: "chat_upload",
      conversationId,
      name: "reference.png",
      url: expect.any(String),
    },
  ])
  await expect(
    ben.query(anyApi.library.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).resolves.toMatchObject({ page: [] })

  const assistantMessage = (
    await ada.query(api.conversations.listMessages, { conversationId })
  ).find((message) => message.role === "assistant")
  expect(assistantMessage).toBeDefined()
  const generatedStorageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(["generated"]))
  )
  const generatedMetadataStorageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(["metadata"]))
  )
  await t.mutation(internal.conversations.finishOpenRouterResponse, {
    assistantMessageId: assistantMessage!._id,
    attachments: [
      {
        contentType: "image/webp",
        name: "generated-image.webp",
        size: 9,
        storageId: generatedStorageId,
      },
      {
        contentType: "application/json",
        name: "generated-metadata.json",
        size: 8,
        storageId: generatedMetadataStorageId,
      },
    ],
    content: "",
    failed: false,
  })

  const generatedPage = await ada.query(anyApi.library.list, {
    paginationOpts: { cursor: null, numItems: 10 },
    category: "generated_image",
    search: "generated",
  })
  expect(generatedPage.page).toHaveLength(1)
  expect(generatedPage.page).toMatchObject([
    {
      category: "generated_image",
      kind: "generated_image",
      conversationId,
      model: "openai/gpt-image-1",
      provider: "openrouter",
      url: expect.any(String),
    },
  ])

  await ada.mutation(api.conversations.remove, { conversationId })
  await expect(
    ada.query(anyApi.library.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).resolves.toMatchObject({ page: [] })
  await expect(
    t.run(async (ctx) => await ctx.storage.get(generatedStorageId))
  ).resolves.toBeNull()

  const projectStorageId = await t.run(
    async (ctx) => await ctx.storage.store(new Blob(["project"]))
  )
  const projectDraftId = await ada.mutation(api.attachments.register, {
    name: "project-notes.txt",
    storageId: projectStorageId,
  })
  const projectId = await ada.mutation(api.projects.create, {
    name: "Library project",
    sourceDraftAttachmentIds: [projectDraftId],
  })
  const [source] = await ada.query(api.projects.listSources, { projectId })
  expect(source.kind).toBe("file")
  await expect(
    ada.query(anyApi.library.list, {
      paginationOpts: { cursor: null, numItems: 10 },
      category: "upload",
      search: "project-notes",
    })
  ).resolves.toMatchObject({
    page: [{ kind: "project_upload", projectId, url: expect.any(String) }],
  })

  await ada.mutation(api.projects.removeSource, {
    projectId,
    sourceId: source._id,
  })
  await expect(
    ada.query(anyApi.library.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).resolves.toMatchObject({ page: [] })
})

it("backfills historical messages and project files idempotently", async () => {
  const t = convexTest(schema, modules)
  migrationsComponent.register(t)
  const owner = t.withIdentity(identity("clerk|library-backfill"))
  const ownerId = await owner.mutation(api.users.syncCurrent)
  await t.run(async (ctx) => {
    const conversationId = await ctx.db.insert("conversations", {
      ownerId,
      title: "Historical chat",
      status: "active",
      updatedAt: 1,
    })
    const chatStorageId = await ctx.storage.store(new Blob(["historical chat"]))
    await ctx.db.insert("messages", {
      conversationId,
      role: "user",
      content: "Old upload",
      attachments: [
        {
          storageId: chatStorageId,
          name: "historical-chat.txt",
          contentType: "text/plain",
          size: 15,
        },
      ],
      status: "complete",
    })
    const projectId = await ctx.db.insert("projects", {
      ownerId,
      name: "Historical project",
      updatedAt: 1,
    })
    const projectStorageId = await ctx.storage.store(
      new Blob(["historical project"])
    )
    await ctx.db.insert("projectSources", {
      ownerId,
      projectId,
      kind: "file",
      storageId: projectStorageId,
      name: "historical-project.txt",
      contentType: "text/plain",
      size: 18,
      createdAt: 2,
    })
  })

  for (const migration of [
    anyApi.migrations.backfillLibraryFromMessages,
    anyApi.migrations.backfillLibraryFromProjectSources,
  ]) {
    await t.mutation(migration, {})
    await t.finishInProgressScheduledFunctions()
    await t.mutation(migration, { reset: true })
    await t.finishInProgressScheduledFunctions()
  }

  const result = await owner.query(anyApi.library.list, {
    paginationOpts: { cursor: null, numItems: 10 },
  })
  expect(result.page).toHaveLength(2)
  expect(
    result.page.map((asset: { kind: string }) => asset.kind).sort()
  ).toEqual(["chat_upload", "project_upload"])
})
