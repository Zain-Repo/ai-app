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
import type * as memories from "../memories.js";
import type * as memoryPolicy from "../memoryPolicy.js";
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
  memories: typeof memories;
  memoryPolicy: typeof memoryPolicy;
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

export declare const components: {};
