import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { messageAttachmentValidator } from "./attachmentPolicy"
import { terminalRunValidator } from "./terminalPolicy"

const connectionStatus = v.union(
  v.literal("connected"),
  v.literal("needs_reauthentication"),
  v.literal("disconnected")
)

const conversationStatus = v.union(v.literal("active"), v.literal("archived"))

const messageRole = v.union(
  v.literal("system"),
  v.literal("user"),
  v.literal("assistant")
)

const messageStatus = v.union(
  v.literal("pending"),
  v.literal("streaming"),
  v.literal("complete"),
  v.literal("failed")
)

const outputMode = v.union(v.literal("image"), v.literal("text"))

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    clerkUserId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    language: v.optional(
      v.union(
        v.literal("auto"),
        v.literal("en"),
        v.literal("fr"),
        v.literal("es")
      )
    ),
    intelligenceLevel: v.optional(
      v.union(
        v.literal("adaptive"),
        v.literal("quick"),
        v.literal("balanced"),
        v.literal("deep")
      )
    ),
    responseDetail: v.optional(
      v.union(
        v.literal("concise"),
        v.literal("balanced"),
        v.literal("detailed")
      )
    ),
    defaultModel: v.optional(v.string()),
    memoryEnabled: v.optional(v.boolean()),
    memoryRevision: v.optional(v.number()),
    lastSeenAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_user_id", ["clerkUserId"]),

  // Credential material is intentionally excluded. This table stores only
  // safe connection metadata; provider tokens require encrypted secret storage.
  providerConnections: defineTable({
    ownerId: v.id("users"),
    provider: v.string(),
    authMethod: v.union(v.literal("oauth"), v.literal("api_key")),
    status: connectionStatus,
    displayName: v.optional(v.string()),
    externalAccountId: v.optional(v.string()),
    scopes: v.array(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner", ["ownerId"])
    .index("by_owner_provider", ["ownerId", "provider"]),

  providerCredentials: defineTable({
    connectionId: v.id("providerConnections"),
    ciphertext: v.string(),
    iv: v.string(),
    updatedAt: v.number(),
  }).index("by_connection_id", ["connectionId"]),

  projects: defineTable({
    ownerId: v.id("users"),
    name: v.string(),
    instructions: v.optional(v.string()),
    memoryScope: v.optional(
      v.union(v.literal("project_only"), v.literal("all_chats"))
    ),
    updatedAt: v.number(),
  }).index("by_owner_id_and_updated_at", ["ownerId", "updatedAt"]),

  projectSources: defineTable(
    v.union(
      v.object({
        ownerId: v.id("users"),
        projectId: v.id("projects"),
        kind: v.literal("file"),
        name: v.string(),
        storageId: v.id("_storage"),
        contentType: v.string(),
        size: v.number(),
        createdAt: v.number(),
      }),
      v.object({
        ownerId: v.id("users"),
        projectId: v.id("projects"),
        kind: v.literal("link"),
        name: v.string(),
        url: v.string(),
        createdAt: v.number(),
      })
    )
  ).index("by_project_id_and_created_at", ["projectId", "createdAt"]),

  draftAttachments: defineTable({
    ownerId: v.id("users"),
    storageId: v.id("_storage"),
    name: v.string(),
    contentType: v.string(),
    size: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner_id_and_created_at", ["ownerId", "createdAt"])
    .index("by_storage_id", ["storageId"]),

  conversations: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    status: conversationStatus,
    providerConnectionId: v.optional(v.id("providerConnections")),
    model: v.optional(v.string()),
    outputMode: v.optional(outputMode),
    routingProvider: v.optional(v.string()),
    reasoningEffort: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_owner_updated_at", ["ownerId", "updatedAt"])
    .index("by_project_id_and_updated_at", ["projectId", "updatedAt"])
    .index("by_owner_status_updated_at", ["ownerId", "status", "updatedAt"])
    .index("by_project_id_and_status_and_updated_at", [
      "projectId",
      "status",
      "updatedAt",
    ]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: messageRole,
    content: v.string(),
    attachments: v.optional(v.array(messageAttachmentValidator)),
    status: messageStatus,
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    outputMode: v.optional(outputMode),
    routingProvider: v.optional(v.string()),
    reasoningEffort: v.optional(v.string()),
    reasoningSteps: v.optional(v.array(v.string())),
    terminalRuns: v.optional(v.array(terminalRunValidator)),
    uiPayload: v.optional(v.string()),
    errorCode: v.optional(v.literal("insufficient_credits")),
  }).index("by_conversation", ["conversationId"]),

  memories: defineTable({
    ownerId: v.id("users"),
    scope: v.union(v.literal("user"), v.literal("project")),
    scopeKey: v.string(),
    searchScope: v.string(),
    projectId: v.optional(v.id("projects")),
    kind: v.union(v.literal("preference"), v.literal("fact")),
    key: v.string(),
    content: v.string(),
    embedding: v.optional(v.array(v.float64())),
    sourceConversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.optional(v.id("messages")),
    sourceTimestamp: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_id_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_id_and_scope_key_and_kind_and_updated_at", [
      "ownerId",
      "scopeKey",
      "kind",
      "updatedAt",
    ])
    .index("by_owner_id_and_scope_key_and_key", ["ownerId", "scopeKey", "key"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["searchScope"],
    }),
})
