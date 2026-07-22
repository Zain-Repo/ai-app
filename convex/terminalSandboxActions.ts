"use node"

import { v } from "convex/values"

import { env, internalAction } from "./_generated/server"
import { deleteTerminalWorkspace } from "./terminalSandbox"

export const removeWorkspace = internalAction({
  args: {
    key: v.string(),
    scope: v.union(v.literal("chat"), v.literal("project")),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await deleteTerminalWorkspace({
      workerToken: env.TERMINAL_WORKER_TOKEN,
      workerUrl: env.TERMINAL_WORKER_URL,
      workspace: args,
    })
    return null
  },
})
