import { Migrations } from "@convex-dev/migrations"

import { components } from "./_generated/api"
import { indexMessageAttachments, indexProjectSource } from "./library"
import schema from "./schema"

const migrations = new Migrations(components.migrations, { schema })

export const backfillLibraryFromMessages = migrations.define({
  table: "messages",
  migrateOne: async (ctx, message) => {
    if (!message.attachments?.length) return
    if (message.role === "assistant") {
      if (message.status !== "complete" || message.outputMode !== "image")
        return
    } else if (message.role !== "user") {
      return
    }

    const conversation = await ctx.db.get(message.conversationId)
    if (!conversation) return
    await indexMessageAttachments(ctx, {
      ownerId: conversation.ownerId,
      conversationId: conversation._id,
      messageId: message._id,
      role: message.role,
      attachments: message.attachments,
      createdAt: message._creationTime,
      outputMode: message.outputMode,
      provider: message.provider,
      model: message.model,
    })
  },
})

export const backfillLibraryFromProjectSources = migrations.define({
  table: "projectSources",
  migrateOne: async (ctx, source) => {
    if (source.kind !== "file") return
    await indexProjectSource(ctx, {
      ownerId: source.ownerId,
      projectId: source.projectId,
      projectSourceId: source._id,
      attachment: {
        storageId: source.storageId,
        name: source.name,
        contentType: source.contentType,
        size: source.size,
      },
      createdAt: source.createdAt,
    })
  },
})
