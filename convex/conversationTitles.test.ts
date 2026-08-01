import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vitest"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"
import { modules } from "./test.setup"
import { createFallbackChatTitle } from "../shared/chat-title"

type HostedProvider = "openrouter" | "openai"
type AppTest = ReturnType<typeof createAppTest>

function createAppTest() {
  return convexTest(schema, modules)
}

async function insertHostedConversation(
  t: AppTest,
  args: {
    assistantStatus: "complete" | "failed"
    initialQuestion: string
    outputMode: "image" | "text"
    ownerId: Id<"users">
    provider: HostedProvider
  }
) {
  return await t.run(async (ctx) => {
    const connectionId = await ctx.db.insert("providerConnections", {
      authMethod: args.provider === "openrouter" ? "oauth" : "api_key",
      ownerId: args.ownerId,
      provider: args.provider,
      scopes: ["chat"],
      status: "connected",
      updatedAt: Date.now(),
    })
    await ctx.db.insert("providerCredentials", {
      ciphertext: `${args.provider}-ciphertext`,
      connectionId,
      iv: `${args.provider}-iv`,
      updatedAt: Date.now(),
    })
    const conversationId = await ctx.db.insert("conversations", {
      model: "test-model",
      outputMode: args.outputMode,
      ownerId: args.ownerId,
      providerConnectionId: connectionId,
      status: "active",
      title: createFallbackChatTitle(args.initialQuestion),
      titleGenerationStatus: "pending",
      updatedAt: Date.now(),
    })
    const initialUserMessageId = await ctx.db.insert("messages", {
      content: args.initialQuestion,
      conversationId,
      model: "test-model",
      outputMode: args.outputMode,
      provider: args.provider,
      role: "user",
      status: "complete",
    })
    await ctx.db.patch(conversationId, {
      titleSourceMessageId: initialUserMessageId,
    })
    await ctx.db.insert("messages", {
      content: args.assistantStatus === "failed" ? "Request failed" : "Done",
      conversationId,
      model: "test-model",
      outputMode: args.outputMode,
      provider: args.provider,
      role: "assistant",
      status: args.assistantStatus,
    })
    await ctx.db.insert("messages", {
      content: "A later follow-up must not become the title",
      conversationId,
      model: "test-model",
      outputMode: args.outputMode,
      provider: args.provider,
      role: "user",
      status: "complete",
    })
    return conversationId
  })
}

describe("chat title generation", () => {
  it("schedules title generation independently from the hosted response", async () => {
    vi.useFakeTimers()
    try {
      const t = convexTest(schema, modules)
      const authenticated = t.withIdentity({ subject: "scheduled_title_user" })
      const ownerId = await authenticated.mutation(api.users.syncCurrent)
      const connectionId = await t.run(async (ctx) => {
        return await ctx.db.insert("providerConnections", {
          authMethod: "oauth",
          ownerId,
          provider: "openrouter",
          scopes: ["chat"],
          status: "connected",
          updatedAt: Date.now(),
        })
      })

      const conversationId = await authenticated.mutation(
        api.conversations.start,
        {
          content: "Create an image of a quiet mountain cabin",
          model: "openai/gpt-image-1",
          outputMode: "image",
          providerConnectionId: connectionId,
        }
      )
      const scheduled = await t.run(async (ctx) => {
        return await ctx.db.system.query("_scheduled_functions").take(10)
      })

      expect(scheduled.map((job) => job.name).sort()).toEqual([
        "memoryCapture:enqueueForMessage",
        "openRouterResponses:generate",
        "openRouterResponses:generateTitle",
      ])
      const conversation = await authenticated.query(api.conversations.get, {
        conversationId,
      })
      expect(conversation).toMatchObject({
        titleGenerationStatus: "pending",
      })
      expect(conversation?.titleSourceMessageId).toBeDefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    {
      assistantStatus: "complete" as const,
      initialQuestion: "Explain how PostgreSQL partial indexes work",
      outputMode: "text" as const,
      provider: "openrouter" as const,
    },
    {
      assistantStatus: "failed" as const,
      initialQuestion: "Why did the OpenAI request fail?",
      outputMode: "text" as const,
      provider: "openai" as const,
    },
    {
      assistantStatus: "failed" as const,
      initialQuestion: "Create an image of a cabin beside a frozen lake",
      outputMode: "image" as const,
      provider: "openrouter" as const,
    },
  ])(
    "uses the immutable initial question for $provider $outputMode chats",
    async ({ assistantStatus, initialQuestion, outputMode, provider }) => {
      const t = convexTest(schema, modules)
      const authenticated = t.withIdentity({ subject: "title_user" })
      const ownerId = await authenticated.mutation(api.users.syncCurrent)
      const conversationId = await insertHostedConversation(t, {
        assistantStatus,
        initialQuestion,
        outputMode,
        ownerId,
        provider,
      })

      await expect(
        t.query(internal.conversations.getChatTitleGenerationContext, {
          conversationId,
        })
      ).resolves.toMatchObject({
        initialQuestion,
        provider,
      })
    }
  )

  it("does not let late background results overwrite an existing title", async () => {
    const t = convexTest(schema, modules)
    const authenticated = t.withIdentity({ subject: "title_user" })
    const ownerId = await authenticated.mutation(api.users.syncCurrent)
    const conversationId = await insertHostedConversation(t, {
      assistantStatus: "failed",
      initialQuestion: "How should retries use exponential backoff?",
      outputMode: "text",
      ownerId,
      provider: "openrouter",
    })

    await t.mutation(internal.conversations.setGeneratedTitle, {
      conversationId,
      title: "Exponential Backoff Retries",
    })
    await t.mutation(internal.conversations.setGeneratedTitle, {
      conversationId,
      title: "Late Replacement",
    })

    const conversation = await authenticated.query(api.conversations.get, {
      conversationId,
    })
    expect(conversation?.title).toBe("Exponential Backoff Retries")
    expect(conversation?.titleGenerationStatus).toBe("generated")
    await expect(
      t.query(internal.conversations.getChatTitleGenerationContext, {
        conversationId,
      })
    ).resolves.toBeNull()
  })

  it("marks generation complete when the model repeats the fallback title", async () => {
    const t = convexTest(schema, modules)
    const authenticated = t.withIdentity({ subject: "same_title_user" })
    const ownerId = await authenticated.mutation(api.users.syncCurrent)
    const initialQuestion = "Explain database locks"
    const conversationId = await insertHostedConversation(t, {
      assistantStatus: "complete",
      initialQuestion,
      outputMode: "text",
      ownerId,
      provider: "openai",
    })

    await t.mutation(internal.conversations.setGeneratedTitle, {
      conversationId,
      title: initialQuestion,
    })
    await t.mutation(internal.conversations.setGeneratedTitle, {
      conversationId,
      title: "Late Replacement",
    })

    const conversation = await authenticated.query(api.conversations.get, {
      conversationId,
    })
    expect(conversation).toMatchObject({
      title: initialQuestion,
      titleGenerationStatus: "generated",
    })
  })

  it("accepts a desktop Codex title only for its authenticated owner", async () => {
    const t = convexTest(schema, modules)
    const authenticated = t.withIdentity({ subject: "codex_owner" })
    const anotherUser = t.withIdentity({ subject: "another_user" })
    const ownerId = await authenticated.mutation(api.users.syncCurrent)
    await anotherUser.mutation(api.users.syncCurrent)
    const connectionId = await authenticated.mutation(
      api.providerConnections.connectDesktopCodex,
      {}
    )
    const initialQuestion = "Compare optimistic and pessimistic locking"
    const conversationId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("conversations", {
        model: "gpt-5.6-sol",
        ownerId,
        providerConnectionId: connectionId,
        status: "active",
        title: createFallbackChatTitle(initialQuestion),
        titleGenerationStatus: "pending",
        updatedAt: Date.now(),
      })
      const initialUserMessageId = await ctx.db.insert("messages", {
        content: initialQuestion,
        conversationId: id,
        model: "gpt-5.6-sol",
        provider: "codex",
        role: "user",
        status: "complete",
      })
      await ctx.db.patch(id, { titleSourceMessageId: initialUserMessageId })
      return id
    })

    await expect(
      anotherUser.mutation(api.conversations.setDesktopCodexGeneratedTitle, {
        conversationId,
        title: "Database Locking Comparison",
      })
    ).rejects.toThrow("Conversation unavailable")
    await authenticated.mutation(
      api.conversations.setDesktopCodexGeneratedTitle,
      {
        conversationId,
        title: "**Title: Database Locking Comparison**",
      }
    )
    expect(
      (await authenticated.query(api.conversations.get, { conversationId }))
        ?.title
    ).toBe(createFallbackChatTitle(initialQuestion))
    await authenticated.mutation(
      api.conversations.setDesktopCodexGeneratedTitle,
      {
        conversationId,
        title: "Database Locking Comparison",
      }
    )
    await authenticated.mutation(
      api.conversations.setDesktopCodexGeneratedTitle,
      {
        conversationId,
        title: "Late Desktop Title",
      }
    )

    const conversation = await authenticated.query(api.conversations.get, {
      conversationId,
    })
    expect(conversation?.title).toBe("Database Locking Comparison")
  })
})
