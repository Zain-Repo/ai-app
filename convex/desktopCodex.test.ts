import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"

describe("desktop Codex conversations", () => {
  it("leaves the response pending for Electron and completes it once", async () => {
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
      }
    )

    expect(
      await authenticated.query(api.conversations.listMessages, {
        conversationId,
      })
    ).toMatchObject([
      { content: "Explain the result", role: "user", status: "complete" },
      { content: "", role: "assistant", status: "pending" },
    ])

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
})
