import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"
import { modules } from "./test.setup"

async function createCodexConversation(subject: string) {
  const t = convexTest(schema, modules)
  const authenticated = t.withIdentity({
    subject,
    tokenIdentifier: `https://clerk.example.test|${subject}`,
  })
  await authenticated.mutation(api.users.syncCurrent)
  const connectionId = await authenticated.mutation(
    api.providerConnections.connectDesktopCodex,
    { planType: "plus" }
  )
  const conversationId = await authenticated.mutation(api.conversations.start, {
    content: "Original prompt",
    model: "gpt-5.6-sol",
    providerConnectionId: connectionId,
    reasoningEffort: "high",
  })
  return { authenticated, connectionId, conversationId, t }
}

async function completeCurrentCodexResponse(
  authenticated: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  conversationId: Id<"conversations">,
  content = "Original response"
) {
  await authenticated.mutation(api.conversations.finishDesktopCodexResponse, {
    conversationId,
    content,
    failed: false,
  })
}

describe("conversation response branches", () => {
  it("keeps legacy messages linear until the first retry", async () => {
    const { authenticated, connectionId, t } =
      await createCodexConversation("legacy_branch_user")
    const owner = await t.run(
      async (ctx) =>
        await ctx.db
          .query("users")
          .withIndex("by_token_identifier", (query) =>
            query.eq(
              "tokenIdentifier",
              "https://clerk.example.test|legacy_branch_user"
            )
          )
          .unique()
    )
    if (!owner) throw new Error("Expected authenticated owner")
    const legacyConversationId = await t.run(async (ctx) => {
      const conversationId = await ctx.db.insert("conversations", {
        ownerId: owner._id,
        title: "Legacy chat",
        status: "active",
        providerConnectionId: connectionId,
        model: "gpt-5.6-sol",
        outputMode: "text",
        updatedAt: Date.now(),
      })
      await ctx.db.insert("messages", {
        conversationId,
        role: "user",
        content: "Legacy prompt",
        status: "complete",
        provider: "codex",
        model: "gpt-5.6-sol",
        outputMode: "text",
      })
      await ctx.db.insert("messages", {
        conversationId,
        role: "assistant",
        content: "Legacy response",
        status: "complete",
        provider: "codex",
        model: "gpt-5.6-sol",
        outputMode: "text",
      })
      return conversationId
    })

    const before = await authenticated.query(api.conversations.get, {
      conversationId: legacyConversationId,
    })
    expect(before?.activeBranchId).toBeUndefined()
    const linearMessages = await authenticated.query(
      api.conversations.listMessages,
      { conversationId: legacyConversationId }
    )
    expect(linearMessages.map((message) => message.content)).toEqual([
      "Legacy prompt",
      "Legacy response",
    ])

    await authenticated.mutation(api.conversations.retryResponse, {
      assistantMessageId: linearMessages[1]._id,
      conversationId: legacyConversationId,
      expectedActiveBranchId: undefined,
    })
    const branched = await authenticated.query(api.conversations.get, {
      conversationId: legacyConversationId,
    })
    expect(branched?.activeBranchId).toBeDefined()
    const storedLegacyMessages = await t.run(
      async (ctx) =>
        await ctx.db
          .query("messages")
          .withIndex("by_conversation", (query) =>
            query.eq("conversationId", legacyConversationId)
          )
          .order("asc")
          .take(2)
    )
    expect(storedLegacyMessages.every((message) => !message.branchId)).toBe(
      true
    )
  })

  it("retries with a same-provider model and reloads either response branch", async () => {
    const { authenticated, conversationId } =
      await createCodexConversation("retry_branch_user")
    await completeCurrentCodexResponse(authenticated, conversationId)
    const originalConversation = await authenticated.query(
      api.conversations.get,
      {
        conversationId,
      }
    )
    const originalMessages = await authenticated.query(
      api.conversations.listMessages,
      { conversationId }
    )
    const originalAssistant = originalMessages.at(-1)
    if (!originalConversation?.activeBranchId || !originalAssistant)
      throw new Error("Expected root response branch")

    await authenticated.mutation(api.conversations.retryResponse, {
      assistantMessageId: originalAssistant._id,
      conversationId,
      expectedActiveBranchId: originalConversation.activeBranchId,
      modelSettings: { model: "gpt-5.6-terra", reasoningEffort: "medium" },
    })
    const retriedConversation = await authenticated.query(
      api.conversations.get,
      {
        conversationId,
      }
    )
    const retriedMessages = await authenticated.query(
      api.conversations.listMessages,
      { conversationId }
    )
    expect(retriedMessages.at(-1)).toMatchObject({
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      status: "pending",
    })
    expect(retriedMessages.at(-1)?.branchNavigation).toMatchObject({
      index: 1,
      total: 2,
      previousBranchId: originalConversation.activeBranchId,
    })
    if (!retriedConversation?.activeBranchId)
      throw new Error("Expected retry response branch")

    await authenticated.mutation(api.conversations.stopResponse, {
      assistantMessageId: retriedMessages.at(-1)!._id,
      conversationId,
    })
    await authenticated.mutation(api.conversations.selectBranch, {
      branchId: originalConversation.activeBranchId,
      conversationId,
      expectedActiveBranchId: retriedConversation.activeBranchId,
    })
    expect(
      (
        await authenticated.query(api.conversations.listMessages, {
          conversationId,
        })
      ).at(-1)?.content
    ).toBe("Original response")
  })

  it("edits a prompt without changing the original content or attachments", async () => {
    const { authenticated, conversationId, t } =
      await createCodexConversation("edit_branch_user")
    await completeCurrentCodexResponse(authenticated, conversationId)
    const originalConversation = await authenticated.query(
      api.conversations.get,
      {
        conversationId,
      }
    )
    let originalMessages = await authenticated.query(
      api.conversations.listMessages,
      { conversationId }
    )
    if (!originalConversation?.activeBranchId)
      throw new Error("Expected root response branch")
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(
          new Blob(["attachment"], { type: "text/plain" })
        )
    )
    await t.run(async (ctx) => {
      await ctx.db.patch(originalMessages[0]._id, {
        attachments: [
          {
            contentType: "text/plain",
            name: "context.txt",
            size: 10,
            storageId,
          },
        ],
      })
    })
    originalMessages = await authenticated.query(
      api.conversations.listMessages,
      {
        conversationId,
      }
    )

    await authenticated.mutation(api.conversations.editUserMessage, {
      content: "Edited prompt",
      conversationId,
      expectedActiveBranchId: originalConversation.activeBranchId,
      userMessageId: originalMessages[0]._id,
    })
    const editedConversation = await authenticated.query(
      api.conversations.get,
      {
        conversationId,
      }
    )
    const editedMessages = await authenticated.query(
      api.conversations.listMessages,
      { conversationId }
    )
    expect(editedMessages[0]).toMatchObject({
      content: "Edited prompt",
      attachments: [{ name: "context.txt", storageId }],
    })
    if (!editedConversation?.activeBranchId)
      throw new Error("Expected edited response branch")
    await authenticated.mutation(api.conversations.stopResponse, {
      assistantMessageId: editedMessages[1]._id,
      conversationId,
    })
    await authenticated.mutation(api.conversations.selectBranch, {
      branchId: originalConversation.activeBranchId,
      conversationId,
      expectedActiveBranchId: editedConversation.activeBranchId,
    })
    expect(
      await authenticated.query(api.conversations.listMessages, {
        conversationId,
      })
    ).toMatchObject([
      { content: "Original prompt", attachments: [{ storageId }] },
      { content: "Original response" },
    ])
  })

  it("stops idempotently and ignores late desktop updates", async () => {
    const { authenticated, conversationId, t } =
      await createCodexConversation("stop_branch_user")
    const messages = await authenticated.query(api.conversations.listMessages, {
      conversationId,
    })
    const assistantMessageId = messages.at(-1)!._id
    await authenticated.mutation(api.conversations.streamDesktopCodexResponse, {
      conversationId,
      content: "Partial response",
    })
    await authenticated.mutation(api.conversations.stopResponse, {
      assistantMessageId,
      conversationId,
    })
    await authenticated.mutation(api.conversations.stopResponse, {
      assistantMessageId,
      conversationId,
    })
    await authenticated.mutation(api.conversations.streamDesktopCodexResponse, {
      conversationId,
      content: "Late stream",
    })
    await authenticated.mutation(api.conversations.finishDesktopCodexResponse, {
      conversationId,
      content: "Late completion",
      failed: false,
    })
    await t.mutation(internal.conversations.updateOpenRouterResponse, {
      assistantMessageId,
      content: "Late hosted stream",
    })
    await t.mutation(internal.conversations.finishOpenRouterResponse, {
      assistantMessageId,
      content: "Late hosted completion",
      failed: false,
    })
    expect(
      (
        await authenticated.query(api.conversations.listMessages, {
          conversationId,
        })
      ).at(-1)
    ).toMatchObject({ content: "Partial response", status: "stopped" })
  })

  it("rejects stale branch mutations and provider mismatches", async () => {
    const { authenticated, conversationId, t } =
      await createCodexConversation("branch_guard_user")
    await completeCurrentCodexResponse(authenticated, conversationId)
    const conversation = await authenticated.query(api.conversations.get, {
      conversationId,
    })
    const messages = await authenticated.query(api.conversations.listMessages, {
      conversationId,
    })
    if (!conversation?.activeBranchId)
      throw new Error("Expected root response branch")
    await expect(
      authenticated.mutation(api.conversations.retryResponse, {
        assistantMessageId: messages[1]._id,
        conversationId,
        expectedActiveBranchId: undefined,
      })
    ).rejects.toThrow("Conversation changed in another tab")
    await t.run(async (ctx) => {
      await ctx.db.patch(messages[1]._id, { provider: "openrouter" })
    })
    await expect(
      authenticated.mutation(api.conversations.retryResponse, {
        assistantMessageId: messages[1]._id,
        conversationId,
        expectedActiveBranchId: conversation.activeBranchId,
      })
    ).rejects.toThrow("Provider connection unavailable")
  })

  it("enforces ownership for stop, retry, and branch selection", async () => {
    const { authenticated, conversationId, t } =
      await createCodexConversation("branch_owner")
    await completeCurrentCodexResponse(authenticated, conversationId)
    const conversation = await authenticated.query(api.conversations.get, {
      conversationId,
    })
    const messages = await authenticated.query(api.conversations.listMessages, {
      conversationId,
    })
    if (!conversation?.activeBranchId)
      throw new Error("Expected root response branch")
    const attacker = t.withIdentity({
      subject: "branch_attacker",
      tokenIdentifier: "https://clerk.example.test|branch_attacker",
    })
    await attacker.mutation(api.users.syncCurrent)

    await expect(
      attacker.mutation(api.conversations.stopResponse, {
        assistantMessageId: messages[1]._id,
        conversationId,
      })
    ).rejects.toThrow("Conversation unavailable")
    await expect(
      attacker.mutation(api.conversations.retryResponse, {
        assistantMessageId: messages[1]._id,
        conversationId,
        expectedActiveBranchId: conversation.activeBranchId,
      })
    ).rejects.toThrow("Conversation unavailable")
    await expect(
      attacker.mutation(api.conversations.selectBranch, {
        branchId: conversation.activeBranchId,
        conversationId,
        expectedActiveBranchId: conversation.activeBranchId,
      })
    ).rejects.toThrow("Conversation unavailable")
  })

  it("rejects branching once all bounded message slots are used", async () => {
    const { authenticated, conversationId, t } =
      await createCodexConversation("branch_limit_user")
    await completeCurrentCodexResponse(authenticated, conversationId)
    const conversation = await authenticated.query(api.conversations.get, {
      conversationId,
    })
    const messages = await authenticated.query(api.conversations.listMessages, {
      conversationId,
    })
    if (!conversation?.activeBranchId)
      throw new Error("Expected root response branch")
    await t.run(async (ctx) => {
      for (let index = 0; index < 198; index += 1)
        await ctx.db.insert("messages", {
          branchId: conversation.activeBranchId,
          content: "Historical message " + index,
          conversationId,
          role: index % 2 === 0 ? "user" : "assistant",
          status: "complete",
        })
    })

    await expect(
      authenticated.mutation(api.conversations.retryResponse, {
        assistantMessageId: messages[1]._id,
        conversationId,
        expectedActiveBranchId: conversation.activeBranchId,
      })
    ).rejects.toThrow("Conversation has reached its message limit")
  })
})
