import type { WorkspaceProduct } from "@/lib/workspace-product"

export type ChatStarterSuggestion = {
  description: string
  label: string
  prompt: string
}

const chatSuggestions = [
  {
    label: "Plan a feature",
    description: "Turn requirements into an implementation plan.",
    prompt:
      "Help me plan a feature from requirements through implementation and validation.",
  },
  {
    label: "Debug an issue",
    description: "Diagnose a bug from its symptoms and context.",
    prompt:
      "Help me diagnose a bug. Start by asking for the error and the relevant context.",
  },
  {
    label: "Review code",
    description: "Check correctness, security, and maintainability.",
    prompt:
      "Review my code for correctness, maintainability, and security. Ask me to share the relevant files.",
  },
  {
    label: "Explain a concept",
    description: "Learn with a concise, practical example.",
    prompt:
      "Explain a technical concept clearly, with a practical example. Ask me which concept I want to learn.",
  },
] as const satisfies readonly ChatStarterSuggestion[]

const imageSuggestions = [
  {
    label: "Product hero",
    description: "Editorial composition with room for copy.",
    prompt:
      "Create a polished editorial product hero image with soft studio lighting, generous negative space, and no text.",
  },
  {
    label: "App icon",
    description: "A distinctive mark at multiple sizes.",
    prompt:
      "Create a clean, distinctive app icon with a simple silhouette, balanced geometry, and no text.",
  },
  {
    label: "Dashboard concept",
    description: "A high-fidelity desktop product direction.",
    prompt:
      "Create a high-fidelity desktop dashboard concept with clear hierarchy, restrained color, and realistic data.",
  },
  {
    label: "Social graphic",
    description: "A bold square campaign visual.",
    prompt:
      "Create a bold square social campaign graphic with a strong focal point, layered depth, and no text.",
  },
] as const satisfies readonly ChatStarterSuggestion[]

export function getChatStarterSuggestions(
  workspace: WorkspaceProduct
): readonly ChatStarterSuggestion[] {
  return workspace === "image" ? imageSuggestions : chatSuggestions
}
