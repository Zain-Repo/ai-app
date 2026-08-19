import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("desktop Codex conversations", () => {
  it("streams the Electron response before completing it", async () => {
    const t = convexTest(schema, modules)
    const authenticated = t.withIdentity({
      subject: "user_codex",
      tokenIdentifier: "https://clerk.example.test|user_codex",
    })
    await authenticated.mutation(api.users.syncCurrent)
    const connectionId = await authenticated.mutation(
      api.providerConnections.connectDesktopCodex,
      { planType: "plus" }
    )
    const conversationId = await authenticated.mutation(
      api.conversations.start,
      {
        content: "Explain the result",
        model: "gpt-5.6-sol",
        providerConnectionId: connectionId,
        reasoningEffort: "ultra",
      }
    )

    expect(
      await authenticated.query(api.conversations.listMessages, {
        conversationId,
      })
    ).toMatchObject([
      {
        content: "Explain the result",
        reasoningEffort: "ultra",
        role: "user",
        status: "complete",
      },
      {
        content: "",
        reasoningEffort: "ultra",
        role: "assistant",
        status: "pending",
      },
    ])

    await authenticated.mutation(api.conversations.streamDesktopCodexResponse, {
      conversationId,
      content: "",
      reasoningSteps: ["I am checking the available models."],
    })
    expect(
      (
        await authenticated.query(api.conversations.listMessages, {
          conversationId,
        })
      ).at(-1)
    ).toMatchObject({
      content: "",
      reasoningSteps: ["I am checking the available models."],
      status: "streaming",
    })

    await authenticated.mutation(api.conversations.finishDesktopCodexResponse, {
      conversationId,
      content: "Here is the result.",
      failed: false,
      reasoningSteps: ["Checked the request"],
    })
    const messages = await authenticated.query(api.conversations.listMessages, {
      conversationId,
    })
    expect(messages.at(-1)).toMatchObject({
      content: "Here is the result.",
      reasoningSteps: ["Checked the request"],
      role: "assistant",
      status: "complete",
    })
  })

  it("projects indexed source fallback into the desktop Codex user context", async () => {
    const t = convexTest(schema, modules)
    const authenticated = t.withIdentity({
      subject: "user_codex",
      tokenIdentifier: "https://clerk.example.test|user_codex",
    })
    const anotherUser = t.withIdentity({
      subject: "other_user",
      tokenIdentifier: "https://clerk.example.test|other_user",
    })
    const ownerId = await authenticated.mutation(api.users.syncCurrent)
    await anotherUser.mutation(api.users.syncCurrent)
    const codexConnectionId = await authenticated.mutation(
      api.providerConnections.connectDesktopCodex,
      { planType: "plus" }
    )
    const ids = await t.run(async (ctx) => {
      const embeddingConnectionId = await ctx.db.insert("providerConnections", {
        authMethod: "api_key",
        ownerId,
        provider: "openai",
        scopes: ["embeddings"],
        status: "connected",
        updatedAt: Date.now(),
      })
      const projectId = await ctx.db.insert("projects", {
        embeddingProfileRevision: 1,
        name: "Release planning",
        ownerId,
        updatedAt: Date.now(),
      })
      const profileId = await ctx.db.insert("projectEmbeddingProfiles", {
        dimensions: 1536,
        model: "text-embedding-3-small",
        ownerId,
        projectId,
        provider: "openai",
        providerConnectionId: embeddingConnectionId,
        revision: 1,
        status: "active",
        updatedAt: Date.now(),
      })
      await ctx.db.patch(projectId, { embeddingProfileId: profileId })
      const storageId = await ctx.storage.store(
        new Blob(["Plan release"], { type: "text/plain" })
      )
      const sourceId = await ctx.db.insert("projectSources", {
        contentType: "text/plain",
        createdAt: Date.now(),
        kind: "file",
        name: "release-plan.txt",
        ownerId,
        projectId,
        size: 12,
        storageId,
      })
      await ctx.db.insert("projectSourceIndexStates", {
        attempts: 1,
        chunkCount: 1,
        embeddingProfileId: profileId,
        embeddingProfileRevision: 1,
        ownerId,
        projectId,
        sourceFingerprint: "release-plan-v1",
        sourceId,
        status: "ready",
        updatedAt: Date.now(),
      })
      await ctx.db.insert("projectSourceChunks", {
        chunkIndex: 0,
        content: "Plan the release for Tuesday and notify support.",
        embedding: Array(1536).fill(0),
        embeddingProfileId: profileId,
        embeddingProfileRevision: 1,
        ownerId,
        projectId,
        searchScope: `owner:${ownerId}:project:${projectId}:profile:1`,
        sourceFingerprint: "release-plan-v1",
        sourceId,
      })
      return { projectId }
    })
    const conversationId = await authenticated.mutation(
      api.conversations.start,
      {
        content: "What is the release plan?",
        model: "gpt-5.6-sol",
        projectId: ids.projectId,
        providerConnectionId: codexConnectionId,
      }
    )

    await expect(
      authenticated.query(
        internal.conversations.getDesktopCodexProjectSourceRequest,
        { conversationId }
      )
    ).resolves.toMatchObject({
      ownerId,
      projectId: ids.projectId,
      query: "What is the release plan?",
    })
    await expect(
      anotherUser.query(
        internal.conversations.getDesktopCodexProjectSourceRequest,
        { conversationId }
      )
    ).resolves.toBeNull()
    await expect(
      t.query(internal.projectEmbeddings.getDesktopCodexProjectSourceFallback, {
        ownerId,
        projectId: ids.projectId,
      })
    ).resolves.toEqual([
      {
        content: "Plan the release for Tuesday and notify support.",
        name: "release-plan.txt",
      },
    ])
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("projectSourceIndexStates")
        .withIndex("by_project_id_and_updated_at", (query) =>
          query.eq("projectId", ids.projectId)
        )
        .unique()
      if (!state) throw new Error("Expected project source index state")
      await ctx.db.patch(state._id, { sourceFingerprint: "stale-source" })
    })
    await expect(
      t.query(internal.projectEmbeddings.getDesktopCodexProjectSourceFallback, {
        ownerId,
        projectId: ids.projectId,
      })
    ).resolves.toEqual([])
    await t.run(async (ctx) => {
      const state = await ctx.db
        .query("projectSourceIndexStates")
        .withIndex("by_project_id_and_updated_at", (query) =>
          query.eq("projectId", ids.projectId)
        )
        .unique()
      if (!state) throw new Error("Expected project source index state")
      await ctx.db.patch(state._id, {
        sourceFingerprint: "release-plan-v1",
      })
    })
    await expect(
      authenticated.action(
        api.openRouterResponses.getDesktopCodexProjectContext,
        {
          conversationId,
        }
      )
    ).resolves.toContain("Plan the release for Tuesday")
    await expect(
      anotherUser.action(
        api.openRouterResponses.getDesktopCodexProjectContext,
        {
          conversationId,
        }
      )
    ).resolves.toBe("")
    await t.run(async (ctx) => {
      const source = await ctx.db
        .query("projectSources")
        .withIndex("by_project_id_and_created_at", (query) =>
          query.eq("projectId", ids.projectId)
        )
        .unique()
      if (!source) throw new Error("Expected project source")
      await ctx.db.delete(source._id)
    })
    await expect(
      t.query(internal.projectEmbeddings.getDesktopCodexProjectSourceFallback, {
        ownerId,
        projectId: ids.projectId,
      })
    ).resolves.toEqual([])
    await expect(
      authenticated.action(
        api.openRouterResponses.getDesktopCodexProjectContext,
        {
          conversationId,
        }
      )
    ).resolves.toBe("")
  })
})
