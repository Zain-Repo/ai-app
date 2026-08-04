import migrations from "@convex-dev/migrations/convex.config.js"
import { defineApp } from "convex/server"
import { v } from "convex/values"

const app = defineApp({
  env: {
    PROVIDER_TOKEN_ENCRYPTION_KEY: v.string(),
    MEMORY_V2_ROLLOUT: v.optional(v.string()),
    TERMINAL_WORKER_TOKEN: v.optional(v.string()),
    TERMINAL_WORKER_URL: v.optional(v.string()),
  },
})

app.use(migrations)

export default app
