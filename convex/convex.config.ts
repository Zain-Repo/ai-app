import { defineApp } from "convex/server"
import { v } from "convex/values"

export default defineApp({
  env: {
    PROVIDER_TOKEN_ENCRYPTION_KEY: v.string(),
    TERMINAL_WORKER_TOKEN: v.optional(v.string()),
    TERMINAL_WORKER_URL: v.optional(v.string()),
  },
})
