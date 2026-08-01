import { getProjectContextProgressCompletedIds } from "@/lib/project-context-progress"
import type { ProjectContextProgressItemId } from "@/lib/project-context-progress"
import {
  SetupChecklist,
  SetupChecklistCard,
  SetupChecklistDescription,
  SetupChecklistHeader,
  SetupChecklistItem,
  SetupChecklistList,
  SetupChecklistProgress,
  SetupChecklistTitle,
} from "@/components/ui/setup-checklist"

type ProjectContextProgressProps = {
  instructions: string
  name: string
  onSelect: (item: ProjectContextProgressItemId) => void
  sourceCount: number
}

export function ProjectContextProgress({
  instructions,
  name,
  onSelect,
  sourceCount,
}: ProjectContextProgressProps) {
  const completedIds = getProjectContextProgressCompletedIds({
    instructions,
    name,
    sourceCount,
  })

  return (
    <SetupChecklist className="max-w-none" completedIds={completedIds}>
      <SetupChecklistCard className="p-4">
        <SetupChecklistHeader className="flex flex-col gap-3">
          <div>
            <SetupChecklistTitle>Project context</SetupChecklistTitle>
            <SetupChecklistDescription>
              Add the context that matters before creating this project.
            </SetupChecklistDescription>
          </div>
          <SetupChecklistProgress className="mt-0 self-start">
            Context
          </SetupChecklistProgress>
        </SetupChecklistHeader>
        <SetupChecklistList className="mt-4 gap-2">
          <SetupChecklistItem
            description="Give this workspace a clear name."
            id="name"
            onClick={() => onSelect("name")}
            title="Name the project"
          />
          <SetupChecklistItem
            description="Set durable guidance for every chat."
            id="instructions"
            onClick={() => onSelect("instructions")}
            title="Add instructions"
          />
          <SetupChecklistItem
            description="Optional files and links add shared context."
            id="sources"
            onClick={() => onSelect("sources")}
            title="Add sources"
          />
        </SetupChecklistList>
      </SetupChecklistCard>
    </SetupChecklist>
  )
}
