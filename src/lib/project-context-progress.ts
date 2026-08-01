export const projectContextProgressItemIds = [
  "name",
  "instructions",
  "sources",
] as const

export type ProjectContextProgressItemId =
  (typeof projectContextProgressItemIds)[number]

export type ProjectContextProgressInput = {
  instructions?: string
  name?: string
  sourceCount: number
}

export function getProjectContextProgressCompletedIds({
  instructions,
  name,
  sourceCount,
}: ProjectContextProgressInput): ProjectContextProgressItemId[] {
  return projectContextProgressItemIds.filter((id) => {
    if (id === "name") return Boolean(name?.trim())
    if (id === "instructions") return Boolean(instructions?.trim())
    return sourceCount > 0
  })
}
