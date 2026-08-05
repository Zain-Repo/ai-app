import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { messageAttachmentValidator } from "./attachmentPolicy"
import {
  imageGenerationConfigValidator,
  imageGenerationJobStatusValidator,
  imageGenerationOutputStatusValidator,
  imageGenerationSetStatusValidator,
  imageProviderValidator,
} from "./imageGenerationPolicy"
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
  v.literal("failed"),
  v.literal("stopped")
)

const outputMode = v.union(v.literal("image"), v.literal("text"))

const storedLibraryAssetValidator = v.object({
  ownerId: v.id("users"),
  storageId: v.id("_storage"),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  createdAt: v.number(),
})

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
    userMessageBubbleColor: v.optional(
      v.union(
        v.literal("default"),
        v.literal("sky"),
        v.literal("violet"),
        v.literal("rose"),
        v.literal("emerald"),
        v.literal("amber"),
        v.literal("slate")
      )
    ),
    defaultModel: v.optional(v.string()),
    memoryEnabled: v.optional(v.boolean()),
    memoryHistoryEnabled: v.optional(v.boolean()),
    memoryHistoryRevision: v.optional(v.number()),
    memoryRevision: v.optional(v.number()),
    lastSeenAt: v.number(),
  })
    .index("by_token_identifier", ["tokenIdentifier"])
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_last_seen_at", { fields: ["lastSeenAt"], staged: true }),

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
    embeddingProfileId: v.optional(v.id("projectEmbeddingProfiles")),
    embeddingProfileRevision: v.optional(v.number()),
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

  projectEmbeddingProfiles: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("projects"),
    providerConnectionId: v.id("providerConnections"),
    provider: v.union(v.literal("openrouter"), v.literal("openai")),
    model: v.string(),
    dimensions: v.number(),
    revision: v.number(),
    status: v.union(v.literal("active"), v.literal("superseded")),
    updatedAt: v.number(),
  }).index("by_project_id_and_revision", ["projectId", "revision"]),

  projectSourceIndexStates: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("projects"),
    sourceId: v.id("projectSources"),
    embeddingProfileId: v.optional(v.id("projectEmbeddingProfiles")),
    embeddingProfileRevision: v.optional(v.number()),
    sourceFingerprint: v.optional(v.string()),
    status: v.union(
      v.literal("queued"),
      v.literal("extracting"),
      v.literal("indexing"),
      v.literal("ready"),
      v.literal("partial"),
      v.literal("failed"),
      v.literal("unsupported")
    ),
    errorCode: v.optional(
      v.union(
        v.literal("provider_required"),
        v.literal("needs_reauthentication"),
        v.literal("insufficient_credits"),
        v.literal("pdf_no_text"),
        v.literal("pdf_too_large"),
        v.literal("pdf_unreadable"),
        v.literal("unsupported"),
        v.literal("indexing_failed")
      )
    ),
    chunkCount: v.number(),
    attempts: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_id_and_updated_at", ["sourceId", "updatedAt"])
    .index("by_embedding_profile_id_and_updated_at", [
      "embeddingProfileId",
      "updatedAt",
    ])
    .index("by_project_id_and_updated_at", ["projectId", "updatedAt"]),

  projectSourceChunks: defineTable({
    ownerId: v.id("users"),
    projectId: v.id("projects"),
    sourceId: v.id("projectSources"),
    embeddingProfileId: v.id("projectEmbeddingProfiles"),
    embeddingProfileRevision: v.number(),
    sourceFingerprint: v.string(),
    searchScope: v.string(),
    chunkIndex: v.number(),
    content: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_source_id_and_embedding_profile_revision", [
      "sourceId",
      "embeddingProfileRevision",
    ])
    .index("by_project_id_and_embedding_profile_revision", [
      "projectId",
      "embeddingProfileRevision",
    ])
    .index("by_embedding_profile_id", ["embeddingProfileId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["searchScope"],
    }),

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

  libraryAssets: defineTable(
    v.union(
      storedLibraryAssetValidator.extend({
        category: v.literal("upload"),
        kind: v.literal("chat_upload"),
        conversationId: v.id("conversations"),
        messageId: v.id("messages"),
      }),
      storedLibraryAssetValidator.extend({
        category: v.literal("upload"),
        kind: v.literal("project_upload"),
        projectId: v.id("projects"),
        projectSourceId: v.id("projectSources"),
      }),
      storedLibraryAssetValidator.extend({
        category: v.literal("generated_image"),
        kind: v.literal("generated_image"),
        conversationId: v.id("conversations"),
        messageId: v.id("messages"),
        generationSetId: v.optional(v.id("imageGenerationSets")),
        generationOutputId: v.optional(v.id("imageGenerationOutputs")),
        provider: v.optional(v.string()),
        model: v.optional(v.string()),
      })
    )
  )
    .index("by_owner_id_and_created_at", ["ownerId", "createdAt"])
    .index("by_owner_id_and_category_and_created_at", [
      "ownerId",
      "category",
      "createdAt",
    ])
    .index("by_message_id_and_storage_id", ["messageId", "storageId"])
    .index("by_project_source_id", ["projectSourceId"])
    .searchIndex("search_name", {
      searchField: "name",
      filterFields: ["ownerId", "category"],
    }),

  conversations: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    title: v.string(),
    titleGenerationStatus: v.optional(
      v.union(v.literal("pending"), v.literal("generated"))
    ),
    titleSourceMessageId: v.optional(v.id("messages")),
    status: conversationStatus,
    providerConnectionId: v.optional(v.id("providerConnections")),
    model: v.optional(v.string()),
    outputMode: v.optional(outputMode),
    routingProvider: v.optional(v.string()),
    reasoningEffort: v.optional(v.string()),
    activeBranchId: v.optional(v.id("conversationBranches")),
    // "off" conversations continue to exist in history but never read or write
    // personalization data. Older conversations default to "standard".
    memoryMode: v.optional(
      v.union(v.literal("standard"), v.literal("read_only"), v.literal("off"))
    ),
    updatedAt: v.number(),
  })
    .index("by_owner_updated_at", ["ownerId", "updatedAt"])
    .index("by_project_id_and_updated_at", ["projectId", "updatedAt"])
    .index("by_owner_status_updated_at", ["ownerId", "status", "updatedAt"])
    .index("by_owner_id_and_status_and_output_mode_and_updated_at", {
      fields: ["ownerId", "status", "outputMode", "updatedAt"],
      staged: true,
    })
    .index("by_owner_id_and_project_id_and_status_and_updated_at", {
      fields: ["ownerId", "projectId", "status", "updatedAt"],
      staged: true,
    })
    .index("by_owner_id_project_id_status_output_mode_updated_at", {
      fields: ["ownerId", "projectId", "status", "outputMode", "updatedAt"],
      staged: true,
    })
    .index("by_project_id_and_status_and_updated_at", [
      "projectId",
      "status",
      "updatedAt",
    ]),

  conversationBranches: defineTable({
    conversationId: v.id("conversations"),
    parentBranchId: v.optional(v.id("conversationBranches")),
    forkedAfterMessageId: v.optional(v.id("messages")),
    lastMessageId: v.optional(v.id("messages")),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_parent_and_fork", ["parentBranchId", "forkedAfterMessageId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    branchId: v.optional(v.id("conversationBranches")),
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
    contextTokens: v.optional(v.number()),
    terminalRuns: v.optional(v.array(terminalRunValidator)),
    uiPayload: v.optional(v.string()),
    errorCode: v.optional(v.literal("insufficient_credits")),
    scheduledGenerationId: v.optional(v.id("_scheduled_functions")),
    generationSetId: v.optional(v.id("imageGenerationSets")),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_branch", ["branchId"]),

  imageGenerationSets: defineTable({
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    userMessageId: v.id("messages"),
    assistantMessageId: v.id("messages"),
    providerConnectionId: v.id("providerConnections"),
    provider: imageProviderValidator,
    model: v.string(),
    endpoint: v.optional(v.string()),
    prompt: v.string(),
    config: imageGenerationConfigValidator,
    capabilityRevision: v.string(),
    requestedMinimum: v.number(),
    requestedMaximum: v.number(),
    pricingKind: v.union(
      v.literal("exact"),
      v.literal("from"),
      v.literal("range"),
      v.literal("unknown")
    ),
    pricingDisplay: v.optional(v.string()),
    status: imageGenerationSetStatusValidator,
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_id_and_created_at", ["ownerId", "createdAt"])
    .index("by_conversation_id_and_created_at", ["conversationId", "createdAt"])
    .index("by_assistant_message_id", ["assistantMessageId"])
    .index("by_owner_id_and_idempotency_key", ["ownerId", "idempotencyKey"]),

  imageGenerationJobs: defineTable({
    generationSetId: v.id("imageGenerationSets"),
    attempt: v.number(),
    providerRequestId: v.optional(v.string()),
    requestedOutputs: v.number(),
    status: imageGenerationJobStatusValidator,
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    cancellationRequestedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_generation_set_id_and_attempt", ["generationSetId", "attempt"])
    .index("by_generation_set_id_and_status", ["generationSetId", "status"]),

  imageGenerationOutputs: defineTable({
    generationSetId: v.id("imageGenerationSets"),
    generationJobId: v.id("imageGenerationJobs"),
    ordinal: v.number(),
    status: imageGenerationOutputStatusValidator,
    storageId: v.optional(v.id("_storage")),
    libraryAssetId: v.optional(v.id("libraryAssets")),
    name: v.optional(v.string()),
    contentType: v.optional(v.string()),
    size: v.optional(v.number()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
    seed: v.optional(v.number()),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_generation_set_id_and_ordinal", ["generationSetId", "ordinal"])
    .index("by_generation_set_id_and_status", ["generationSetId", "status"])
    .index("by_generation_job_id_and_ordinal", ["generationJobId", "ordinal"]),

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

  // Versioned v2 memory records. The legacy `memories` table remains during
  // migration so existing clients and in-flight OpenRouter extraction keep
  // working. New agent paths use the tables below.
  memoryProcessingProfiles: defineTable({
    ownerId: v.id("users"),
    providerConnectionId: v.id("providerConnections"),
    provider: v.union(v.literal("openrouter"), v.literal("openai")),
    extractionModel: v.string(),
    embeddingModel: v.string(),
    dimensions: v.number(),
    policyRevision: v.number(),
    status: v.union(
      v.literal("active"),
      v.literal("paused"),
      v.literal("needs_reauthentication"),
      v.literal("disconnected")
    ),
    updatedAt: v.number(),
  }).index("by_owner_id", ["ownerId"]),

  memoryItems: defineTable({
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    scope: v.union(v.literal("user"), v.literal("project")),
    scopeKey: v.string(),
    category: v.union(
      v.literal("core_profile"),
      v.literal("preference"),
      v.literal("fact"),
      v.literal("workstyle")
    ),
    canonicalKey: v.string(),
    content: v.string(),
    status: v.union(
      v.literal("active"),
      v.literal("candidate"),
      v.literal("needs_review"),
      v.literal("archived"),
      v.literal("removed")
    ),
    sourceSignal: v.union(
      v.literal("manual"),
      v.literal("direct_statement"),
      v.literal("history_candidate"),
      v.literal("inferred")
    ),
    confirmation: v.union(v.literal("confirmed"), v.literal("pending")),
    pinned: v.boolean(),
    sensitivity: v.union(v.literal("normal"), v.literal("sensitive")),
    revision: v.number(),
    sourceConversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.optional(v.id("messages")),
    sourceTimestamp: v.number(),
    expiresAt: v.optional(v.number()),
    removedAt: v.optional(v.number()),
    undoExpiresAt: v.optional(v.number()),
    lastUsedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_owner_id_and_status_and_updated_at", [
      "ownerId",
      "status",
      "updatedAt",
    ])
    .index("by_owner_id_and_scope_key_and_canonical_key", [
      "ownerId",
      "scopeKey",
      "canonicalKey",
    ])
    .index("by_owner_id_and_scope_key_and_status_and_updated_at", [
      "ownerId",
      "scopeKey",
      "status",
      "updatedAt",
    ])
    .index("by_project_id_and_status_and_updated_at", [
      "projectId",
      "status",
      "updatedAt",
    ]),

  memoryEvidence: defineTable({
    ownerId: v.id("users"),
    memoryItemId: v.id("memoryItems"),
    sourceConversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.optional(v.id("messages")),
    sourceSignal: v.union(
      v.literal("manual"),
      v.literal("direct_statement"),
      v.literal("history_candidate"),
      v.literal("inferred")
    ),
    note: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_memory_item_id_and_created_at", ["memoryItemId", "createdAt"])
    .index("by_source_message_id", ["sourceMessageId"]),

  memoryVersions: defineTable({
    ownerId: v.id("users"),
    memoryItemId: v.id("memoryItems"),
    revision: v.number(),
    content: v.string(),
    category: v.union(
      v.literal("core_profile"),
      v.literal("preference"),
      v.literal("fact"),
      v.literal("workstyle")
    ),
    sourceSignal: v.union(
      v.literal("manual"),
      v.literal("direct_statement"),
      v.literal("history_candidate"),
      v.literal("inferred")
    ),
    changedAt: v.number(),
  }).index("by_memory_item_id_and_revision", ["memoryItemId", "revision"]),

  conversationMemorySummaries: defineTable({
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    projectId: v.optional(v.id("projects")),
    content: v.string(),
    sourceMessageId: v.optional(v.id("messages")),
    revision: v.number(),
    suppressedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_conversation_id", ["conversationId"])
    .index("by_owner_id_and_updated_at", ["ownerId", "updatedAt"])
    .index("by_owner_id_and_project_id_and_updated_at", [
      "ownerId",
      "projectId",
      "updatedAt",
    ])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["ownerId"],
    }),

  memorySearchDocuments: defineTable({
    ownerId: v.id("users"),
    memoryItemId: v.id("memoryItems"),
    scopeKey: v.string(),
    searchScope: v.string(),
    profileId: v.id("memoryProcessingProfiles"),
    profileRevision: v.number(),
    itemRevision: v.number(),
    contentHash: v.string(),
    content: v.string(),
    embedding: v.array(v.float64()),
    updatedAt: v.number(),
  })
    .index("by_memory_item_id_and_profile_revision", [
      "memoryItemId",
      "profileRevision",
    ])
    .searchIndex("search_content", {
      searchField: "content",
      filterFields: ["ownerId", "scopeKey", "profileRevision"],
    })
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
      filterFields: ["searchScope"],
    }),

  memoryJobs: defineTable({
    ownerId: v.id("users"),
    kind: v.union(
      v.literal("capture"),
      v.literal("embed"),
      v.literal("history_backfill")
    ),
    sourceConversationId: v.optional(v.id("conversations")),
    sourceMessageId: v.optional(v.id("messages")),
    memoryItemId: v.optional(v.id("memoryItems")),
    profileId: v.optional(v.id("memoryProcessingProfiles")),
    profileRevision: v.number(),
    policyRevision: v.number(),
    historyRevision: v.optional(v.number()),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("failed"),
      v.literal("complete"),
      v.literal("cancelled")
    ),
    attempts: v.number(),
    nextAttemptAt: v.number(),
    errorCode: v.optional(
      v.union(
        v.literal("provider_required"),
        v.literal("needs_reauthentication"),
        v.literal("profile_changed"),
        v.literal("stale_source"),
        v.literal("processing_failed")
      )
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_source_message_id_and_policy_revision", [
      "sourceMessageId",
      "policyRevision",
    ])
    .index("by_source_conversation_id_and_kind", [
      "sourceConversationId",
      "kind",
    ])
    .index("by_owner_id_and_status_and_next_attempt_at", [
      "ownerId",
      "status",
      "nextAttemptAt",
    ])
    .index("by_memory_item_id_and_profile_revision_and_kind", [
      "memoryItemId",
      "profileRevision",
      "kind",
    ]),

  memoryTombstones: defineTable({
    ownerId: v.id("users"),
    keyHash: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_owner_id", ["ownerId"])
    .index("by_owner_id_and_key_hash", ["ownerId", "keyHash"])
    .index("by_expires_at", ["expiresAt"]),

  // A single cursor makes periodic owner retention bounded while eventually
  // visiting every account instead of repeatedly selecting the first page.
  memoryRetentionSweeps: defineTable({
    name: v.string(),
    cursor: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_name", ["name"]),

  responseMemoryReferences: defineTable({
    ownerId: v.id("users"),
    conversationId: v.id("conversations"),
    responseMessageId: v.id("messages"),
    memoryItemId: v.optional(v.id("memoryItems")),
    summaryId: v.optional(v.id("conversationMemorySummaries")),
    feedback: v.optional(
      v.union(
        v.literal("helpful"),
        v.literal("incorrect"),
        v.literal("dont_use")
      )
    ),
    createdAt: v.number(),
  })
    .index("by_response_message_id", ["responseMessageId"])
    .index("by_conversation_id", ["conversationId"])
    .index("by_owner_id", ["ownerId"])
    .index("by_summary_id", ["summaryId"])
    .index("by_memory_item_id", ["memoryItemId"]),

  memoryMigrationRuns: defineTable({
    ownerId: v.id("users"),
    startedAt: v.number(),
    cursor: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    migratedCount: v.number(),
  }).index("by_owner_id", ["ownerId"]),
})
