/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as attachmentPolicy from "../attachmentPolicy.js";
import type * as attachments from "../attachments.js";
import type * as auth from "../auth.js";
import type * as authHelpers from "../authHelpers.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as fal from "../fal.js";
import type * as library from "../library.js";
import type * as memories from "../memories.js";
import type * as memoryActions from "../memoryActions.js";
import type * as memoryCapture from "../memoryCapture.js";
import type * as memoryContext from "../memoryContext.js";
import type * as memoryHistory from "../memoryHistory.js";
import type * as memoryJobs from "../memoryJobs.js";
import type * as memoryMigration from "../memoryMigration.js";
import type * as memoryPolicy from "../memoryPolicy.js";
import type * as memoryRetention from "../memoryRetention.js";
import type * as memoryRolloutPolicy from "../memoryRolloutPolicy.js";
import type * as memoryTypes from "../memoryTypes.js";
import type * as migrations from "../migrations.js";
import type * as openRouterResponses from "../openRouterResponses.js";
import type * as projectEmbeddingPolicy from "../projectEmbeddingPolicy.js";
import type * as projectEmbeddings from "../projectEmbeddings.js";
import type * as projects from "../projects.js";
import type * as providerConnections from "../providerConnections.js";
import type * as providerCrypto from "../providerCrypto.js";
import type * as providerEmbeddings from "../providerEmbeddings.js";
import type * as providerOAuth from "../providerOAuth.js";
import type * as systemPrompt from "../systemPrompt.js";
import type * as terminalPolicy from "../terminalPolicy.js";
import type * as terminalSandbox from "../terminalSandbox.js";
import type * as terminalSandboxActions from "../terminalSandboxActions.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  attachmentPolicy: typeof attachmentPolicy;
  attachments: typeof attachments;
  auth: typeof auth;
  authHelpers: typeof authHelpers;
  conversations: typeof conversations;
  crons: typeof crons;
  fal: typeof fal;
  library: typeof library;
  memories: typeof memories;
  memoryActions: typeof memoryActions;
  memoryCapture: typeof memoryCapture;
  memoryContext: typeof memoryContext;
  memoryHistory: typeof memoryHistory;
  memoryJobs: typeof memoryJobs;
  memoryMigration: typeof memoryMigration;
  memoryPolicy: typeof memoryPolicy;
  memoryRetention: typeof memoryRetention;
  memoryRolloutPolicy: typeof memoryRolloutPolicy;
  memoryTypes: typeof memoryTypes;
  migrations: typeof migrations;
  openRouterResponses: typeof openRouterResponses;
  projectEmbeddingPolicy: typeof projectEmbeddingPolicy;
  projectEmbeddings: typeof projectEmbeddings;
  projects: typeof projects;
  providerConnections: typeof providerConnections;
  providerCrypto: typeof providerCrypto;
  providerEmbeddings: typeof providerEmbeddings;
  providerOAuth: typeof providerOAuth;
  systemPrompt: typeof systemPrompt;
  terminalPolicy: typeof terminalPolicy;
  terminalSandbox: typeof terminalSandbox;
  terminalSandboxActions: typeof terminalSandboxActions;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
};
