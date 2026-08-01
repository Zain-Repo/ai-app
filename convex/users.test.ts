import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("users.syncCurrent", () => {
  it("rejects an anonymous caller", async () => {
    const t = convexTest(schema, modules)

    await expect(t.mutation(api.users.syncCurrent)).rejects.toThrow(
      "Not authenticated"
    )
  })

  it("stores one user per Clerk identity and updates their profile", async () => {
    const t = convexTest(schema, modules)
    const tokenIdentifier = "https://clerk.example.test|user_123"
    const firstIdentity = t.withIdentity({
      subject: "user_123",
      tokenIdentifier,
      name: "Ada Lovelace",
      email: "ada@example.com",
    })

    const firstId = await firstIdentity.mutation(api.users.syncCurrent)
    const updatedIdentity = t.withIdentity({
      subject: "user_123",
      tokenIdentifier,
      name: "Ada Byron",
      email: "ada@example.com",
    })
    const secondId = await updatedIdentity.mutation(api.users.syncCurrent)

    expect(secondId).toEqual(firstId)
    await expect(
      t.run(async (ctx) => await ctx.db.query("users").collect())
    ).resolves.toMatchObject([
      {
        _id: firstId,
        clerkUserId: "user_123",
        name: "Ada Byron",
        email: "ada@example.com",
        tokenIdentifier,
      },
    ])
  })

  it("stores preferences for only the authenticated user", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity({
      subject: "user_123",
      tokenIdentifier: "https://clerk.example.test|user_123",
    })
    const grace = t.withIdentity({
      subject: "user_456",
      tokenIdentifier: "https://clerk.example.test|user_456",
    })
    await ada.mutation(api.users.syncCurrent)
    await grace.mutation(api.users.syncCurrent)

    await expect(ada.query(api.users.getPreferences)).resolves.toEqual({
      defaultModel: null,
      language: "auto",
      intelligenceLevel: "adaptive",
      responseDetail: "balanced",
      userMessageBubbleColor: "default",
    })

    await ada.mutation(api.users.updatePreferences, {
      defaultModel: "anthropic/claude-sonnet",
      language: "fr",
      intelligenceLevel: "deep",
      responseDetail: "detailed",
      userMessageBubbleColor: "violet",
    })

    await expect(ada.query(api.users.getPreferences)).resolves.toEqual({
      defaultModel: "anthropic/claude-sonnet",
      language: "fr",
      intelligenceLevel: "deep",
      responseDetail: "detailed",
      userMessageBubbleColor: "violet",
    })
    await expect(grace.query(api.users.getPreferences)).resolves.toEqual({
      defaultModel: null,
      language: "auto",
      intelligenceLevel: "adaptive",
      responseDetail: "balanced",
      userMessageBubbleColor: "default",
    })
  })

  it("accepts only named user message bubble color options", async () => {
    const t = convexTest(schema, modules)
    const ada = t.withIdentity({
      subject: "user_123",
      tokenIdentifier: "https://clerk.example.test|user_123",
    })
    await ada.mutation(api.users.syncCurrent)

    await expect(
      ada.mutation(api.users.updatePreferences, {
        defaultModel: null,
        language: "auto",
        intelligenceLevel: "adaptive",
        responseDetail: "balanced",
        userMessageBubbleColor: "invalid" as never,
      })
    ).rejects.toThrow()
  })
})
