import { createOpenRouter } from "@openrouter/ai-sdk-provider"

export function createUserOpenRouter(apiKey: string) {
  return createOpenRouter({
    apiKey,
    compatibility: "strict",
  })
}
