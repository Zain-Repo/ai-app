import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"

import { api, internal } from "./_generated/api"
import schema from "./schema"
import { modules } from "./test.setup"
import {
  getDefaultImageGenerationConfig,
  getStaticImageModelCapability,
} from "../shared/image-generation"

async function createFixture(subject: string) {
  const t = convexTest(schema, modules)
  const authenticated = t.withIdentity({
    subject,
    tokenIdentifier: `https://clerk.example.test|${subject}`,
  })
  await authenticated.mutation(api.users.syncCurrent)
  const owner = await t.run(
    async (ctx) =>
      await ctx.db
        .query("users")
        .withIndex("by_token_identifier", (query) =>
          query.eq("tokenIdentifier", `https://clerk.example.test|${subject}`)
        )
        .unique()
  )
  if (!owner) throw new Error("Expected image generation owner")
  const connectionId = await t.run(
    async (ctx) =>
      await ctx.db.insert("providerConnections", {
        authMethod: "api_key",
        ownerId: owner._id,
        provider: "fal",
        scopes: [],
        status: "connected",
        updatedAt: Date.now(),
      })
  )
  const capability = getStaticImageModelCapability(
    "fal",
    "fal-ai/nano-banana-2"
  )
  if (!capability) throw new Error("Expected image capability fixture")
  return { authenticated, capability, connectionId, owner, t }
}

describe("image generation persistence", () => {
  it("creates one idempotent set with per-output state", async () => {
    const { authenticated, capability, connectionId } =
      await createFixture("image_set_owner")
    const request = {
      capability,
      clientRequestId: "client-request-1234",
      config: {
        ...getDefaultImageGenerationConfig(capability),
        count: 3,
      },
      content: "A quiet cabin beneath northern lights",
      model: capability.modelId,
      providerConnectionId: connectionId,
    }

    const first = await authenticated.mutation(
      internal.imageGenerations.createGenerationRequest,
      request
    )
    const duplicate = await authenticated.mutation(
      internal.imageGenerations.createGenerationRequest,
      request
    )

    expect(duplicate).toEqual(first)
    const sets = await authenticated.query(
      api.imageGenerations.listByConversation,
      { conversationId: first.conversationId }
    )
    expect(sets).toHaveLength(1)
    expect(sets[0]).toMatchObject({
      prompt: request.content,
      requestedMaximum: 3,
      requestedMinimum: 3,
      status: "queued",
    })
    expect(sets[0].outputs).toHaveLength(3)
    expect(sets[0].outputs.every((output) => output.status === "queued")).toBe(
      true
    )
  })

  it("allows the owner to cancel without exposing the set to another user", async () => {
    const { authenticated, capability, connectionId, t } =
      await createFixture("image_cancel_owner")
    const created = await authenticated.mutation(
      internal.imageGenerations.createGenerationRequest,
      {
        capability,
        clientRequestId: "cancel-request-1234",
        config: getDefaultImageGenerationConfig(capability),
        content: "A cobalt ceramic vase",
        model: capability.modelId,
        providerConnectionId: connectionId,
      }
    )

    const stranger = t.withIdentity({
      subject: "image_stranger",
      tokenIdentifier: "https://clerk.example.test|image_stranger",
    })
    await stranger.mutation(api.users.syncCurrent)
    expect(
      await stranger.query(api.imageGenerations.listByConversation, {
        conversationId: created.conversationId,
      })
    ).toEqual([])

    await authenticated.mutation(api.imageGenerations.cancel, {
      generationSetId: created.generationSetId,
    })
    const [canceled] = await authenticated.query(
      api.imageGenerations.listByConversation,
      { conversationId: created.conversationId }
    )
    expect(canceled.status).toBe("canceled")
    expect(
      canceled.outputs.every((output) => output.status === "canceled")
    ).toBe(true)
  })

  it("binds execution to the immutable latest attempt", async () => {
    const { authenticated, capability, connectionId, t } = await createFixture(
      "image_attempt_owner"
    )
    const created = await authenticated.mutation(
      internal.imageGenerations.createGenerationRequest,
      {
        capability,
        clientRequestId: "attempt-request-1234",
        config: getDefaultImageGenerationConfig(capability),
        content: "A glass observatory at dusk",
        model: capability.modelId,
        providerConnectionId: connectionId,
      }
    )
    const initial = await t.run(async (ctx) => {
      const generationSet = await ctx.db.get(created.generationSetId)
      if (!generationSet) throw new Error("Expected generation set")
      const job = await ctx.db
        .query("imageGenerationJobs")
        .withIndex("by_generation_set_id_and_attempt", (query) =>
          query.eq("generationSetId", generationSet._id)
        )
        .unique()
      if (!job) throw new Error("Expected generation job")
      return { assistantMessageId: generationSet.assistantMessageId, job }
    })
    const initialClaim = {
      assistantMessageId: initial.assistantMessageId,
      generationJobId: initial.job._id,
    }
    expect(
      await authenticated.mutation(
        internal.imageGenerations.claimExecution,
        initialClaim
      )
    ).not.toBeNull()
    expect(
      await authenticated.mutation(
        internal.imageGenerations.claimExecution,
        initialClaim
      )
    ).toBeNull()
    await authenticated.mutation(api.imageGenerations.cancel, {
      generationSetId: created.generationSetId,
    })
    await authenticated.mutation(internal.imageGenerations.requeue, {
      generationSetId: created.generationSetId,
    })
    const retryJob = await t.run(
      async (ctx) =>
        await ctx.db
          .query("imageGenerationJobs")
          .withIndex("by_generation_set_id_and_attempt", (query) =>
            query.eq("generationSetId", created.generationSetId)
          )
          .order("desc")
          .first()
    )
    if (!retryJob) throw new Error("Expected retry job")
    expect(retryJob._id).not.toBe(initial.job._id)
    expect(
      await authenticated.mutation(internal.imageGenerations.claimExecution, {
        assistantMessageId: initial.assistantMessageId,
        generationJobId: initial.job._id,
      })
    ).toBeNull()
    expect(
      await authenticated.mutation(internal.imageGenerations.claimExecution, {
        assistantMessageId: initial.assistantMessageId,
        generationJobId: retryJob._id,
      })
    ).not.toBeNull()
  })

  it("atomically records partial output state and Library lineage", async () => {
    const { authenticated, capability, connectionId, t } = await createFixture(
      "image_completion_owner"
    )
    const created = await authenticated.mutation(
      internal.imageGenerations.createGenerationRequest,
      {
        capability,
        clientRequestId: "completion-request-1234",
        config: { ...getDefaultImageGenerationConfig(capability), count: 3 },
        content: "A detailed lunar greenhouse",
        model: capability.modelId,
        providerConnectionId: connectionId,
      }
    )
    const execution = await t.run(async (ctx) => {
      const generationSet = await ctx.db.get(created.generationSetId)
      if (!generationSet) throw new Error("Expected generation set")
      const job = await ctx.db
        .query("imageGenerationJobs")
        .withIndex("by_generation_set_id_and_attempt", (query) =>
          query.eq("generationSetId", generationSet._id)
        )
        .unique()
      if (!job) throw new Error("Expected generation job")
      return { assistantMessageId: generationSet.assistantMessageId, job }
    })
    await authenticated.mutation(internal.imageGenerations.claimExecution, {
      assistantMessageId: execution.assistantMessageId,
      generationJobId: execution.job._id,
    })
    const storageId = await t.run(
      async (ctx) =>
        await ctx.storage.store(new Blob(["image"], { type: "image/png" }))
    )
    expect(
      await authenticated.mutation(internal.imageGenerations.stageOutput, {
        generationSetId: created.generationSetId,
        generationJobId: execution.job._id,
        ordinal: 0,
        output: {
          contentType: "image/png",
          name: "generated.png",
          size: 5,
          storageId,
        },
      })
    ).toBe(true)
    expect(
      await authenticated.mutation(
        internal.imageGenerations.completeGeneration,
        {
          generationSetId: created.generationSetId,
          generationJobId: execution.job._id,
        }
      )
    ).toBe(true)

    const [generation] = await authenticated.query(
      api.imageGenerations.listByConversation,
      { conversationId: created.conversationId }
    )
    expect(generation.status).toBe("partial")
    expect(generation.outputs.map((output) => output.status)).toEqual([
      "succeeded",
      "failed",
      "failed",
    ])
    expect(
      generation.outputs.slice(1).map((output) => output.errorCode)
    ).toEqual([
      "provider_returned_fewer_outputs",
      "provider_returned_fewer_outputs",
    ])
    const persisted = await t.run(async (ctx) => ({
      asset: await ctx.db
        .query("libraryAssets")
        .withIndex("by_message_id_and_storage_id", (query) =>
          query
            .eq("messageId", execution.assistantMessageId)
            .eq("storageId", storageId)
        )
        .unique(),
      message: await ctx.db.get(execution.assistantMessageId),
    }))
    expect(persisted.message?.status).toBe("complete")
    if (persisted.asset?.kind !== "generated_image")
      throw new Error("Expected generated Library asset")
    expect(persisted.asset.generationSetId).toBe(created.generationSetId)
    expect(persisted.asset.generationOutputId).toBe(generation.outputs[0]._id)

    const libraryPage = await authenticated.query(api.library.list, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(libraryPage.page).toMatchObject([
      {
        generationSetId: created.generationSetId,
        generationOutputId: generation.outputs[0]._id,
      },
    ])
  })

  it.each(["running", "complete"] as const)(
    "cascades generation data when deleting a %s image thread",
    async (terminalState) => {
      const { authenticated, capability, connectionId, owner, t } =
        await createFixture(`image_delete_${terminalState}`)
      const seeded = await t.run(async (ctx) => {
        const now = Date.now()
        const storageId = await ctx.storage.store(
          new Blob([terminalState], { type: "image/png" })
        )
        const conversationId = await ctx.db.insert("conversations", {
          ownerId: owner._id,
          title: "Temporary image thread",
          status: "active",
          providerConnectionId: connectionId,
          model: capability.modelId,
          outputMode: "image",
          updatedAt: now,
        })
        const userMessageId = await ctx.db.insert("messages", {
          conversationId,
          role: "user",
          content: "A temporary image thread",
          status: "complete",
          outputMode: "image",
        })
        const assistantMessageId = await ctx.db.insert("messages", {
          conversationId,
          role: "assistant",
          content: "",
          ...(terminalState === "complete"
            ? {
                attachments: [
                  {
                    storageId,
                    name: `${terminalState}.png`,
                    contentType: "image/png",
                    size: terminalState.length,
                  },
                ],
              }
            : {}),
          status: terminalState === "complete" ? "complete" : "pending",
          outputMode: "image",
        })
        const generationSetId = await ctx.db.insert("imageGenerationSets", {
          ownerId: owner._id,
          conversationId,
          userMessageId,
          assistantMessageId,
          providerConnectionId: connectionId,
          provider: "fal",
          model: capability.modelId,
          prompt: "A temporary image thread",
          config: getDefaultImageGenerationConfig(capability),
          capabilityRevision: capability.revision,
          requestedMinimum: 1,
          requestedMaximum: 1,
          pricingKind: "unknown",
          status: terminalState,
          idempotencyKey: `delete-${terminalState}-1234`,
          createdAt: now,
          updatedAt: now,
        })
        await ctx.db.patch(assistantMessageId, { generationSetId })
        const jobId = await ctx.db.insert("imageGenerationJobs", {
          generationSetId,
          attempt: 1,
          requestedOutputs: 1,
          status: terminalState,
          createdAt: now,
          updatedAt: now,
        })
        await ctx.db.insert("imageGenerationOutputs", {
          generationSetId,
          generationJobId: jobId,
          ordinal: 0,
          status: terminalState === "complete" ? "succeeded" : "running",
          storageId,
          name: `${terminalState}.png`,
          contentType: "image/png",
          size: terminalState.length,
          createdAt: now,
          updatedAt: now,
        })
        return {
          assistantMessageId,
          conversationId,
          generationSetId,
          jobId,
          storageId,
        }
      })

      await authenticated.mutation(api.conversations.remove, {
        conversationId: seeded.conversationId,
      })
      const remaining = await t.run(async (ctx) => ({
        generationSet: await ctx.db.get(seeded.generationSetId),
        job: await ctx.db.get(seeded.jobId),
        message: await ctx.db.get(seeded.assistantMessageId),
        outputs: await ctx.db
          .query("imageGenerationOutputs")
          .withIndex("by_generation_set_id_and_ordinal", (query) =>
            query.eq("generationSetId", seeded.generationSetId)
          )
          .collect(),
        storageUrl: await ctx.storage.getUrl(seeded.storageId),
      }))
      expect(remaining).toEqual({
        generationSet: null,
        job: null,
        message: null,
        outputs: [],
        storageUrl: null,
      })
    }
  )
})
