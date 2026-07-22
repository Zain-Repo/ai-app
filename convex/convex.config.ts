import { defineApp } from "convex/server"
import { v } from "convex/values"

export default defineApp({
  env: {
    PROVIDER_TOKEN_ENCRYPTION_KEY: v.string(),
  },
})
