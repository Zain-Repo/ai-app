import { OptionList } from "@/components/ui/option-list"
import { ProgressSteps } from "@/components/ui/progress-steps"
import { QuickReply } from "@/components/ui/quick-reply"
import { StatCard } from "@/components/ui/stat-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { parseGenerativeUiPayload } from "../../shared/generative-ui"

type GenerativeUiProps = {
  disabled?: boolean
  onAction?: (value: string) => void
  payload?: string
}

function displayCell(value: boolean | null | number | string | undefined) {
  if (value === null || value === undefined) return "—"
  if (typeof value === "boolean") return value ? "Yes" : "No"
  return String(value)
}

export function GenerativeUi({
  disabled,
  onAction,
  payload,
}: GenerativeUiProps) {
  const ui = parseGenerativeUiPayload(payload)
  if (!ui) return null

  let content
  switch (ui.kind) {
    case "stats":
      content = <StatCard data={{ stats: ui.stats }} />
      break
    case "table":
      content = (
        <div className="overflow-hidden rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                {ui.columns.map((column) => (
                  <TableHead key={column.key}>{column.label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ui.rows.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  {ui.columns.map((column) => (
                    <TableCell key={column.key}>
                      {displayCell(row[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )
      break
    case "quick-replies": {
      content = (
        <QuickReply
          actions={{
            onSelectReply: (reply) => onAction?.(reply.label),
          }}
          data={{ replies: ui.replies }}
        />
      )
      break
    }
    case "options": {
      const options = ui.options.map(({ description, label }) => ({
        description,
        label,
      }))
      content = (
        <OptionList
          actions={{
            onSubmit: (selectedOptions) => {
              const labels = selectedOptions.map((option) => option.label)
              if (labels.length) onAction?.(labels.join(", "))
            },
          }}
          appearance={{ multiple: ui.multiple }}
          data={{ options }}
        />
      )
      break
    }
    case "progress":
      content = <ProgressSteps data={{ steps: ui.steps }} />
      break
  }

  return (
    <section
      aria-label={ui.title ?? "Generated interface"}
      className="min-w-0 space-y-2"
    >
      {ui.title ? <h3 className="text-sm font-medium">{ui.title}</h3> : null}
      <fieldset className="min-w-0 disabled:opacity-60" disabled={disabled}>
        {content}
      </fieldset>
    </section>
  )
}
