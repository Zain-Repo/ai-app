import { createGateway } from "ai"

export function createUserAIGateway(apiKey: string) {
  return createGateway({ apiKey })
}

