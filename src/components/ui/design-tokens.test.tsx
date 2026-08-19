// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Badge } from "./badge"
import { Button } from "./button"
import { CardTitle } from "./card"
import { Label } from "./label"
import { Switch } from "./switch"
import { Table, TableBody, TableCell, TableRow } from "./table"

afterEach(cleanup)

describe("interface design tokens", () => {
  it("uses the compact type and control dimensions", () => {
    render(
      <>
        <CardTitle>Workspace</CardTitle>
        <Label htmlFor="compact-switch">Memory</Label>
        <Button>Save</Button>
        <Switch aria-label="Memory" id="compact-switch" />
      </>
    )

    expect(screen.getByText("Workspace").className).toContain("text-title")
    expect(screen.getByText("Memory").className).toContain("text-label")
    expect(screen.getByRole("button", { name: "Save" }).className).toContain(
      "rounded-[5px]"
    )
    expect(screen.getByRole("button", { name: "Save" }).className).toContain(
      "h-8"
    )

    const switchControl = screen.getByRole("switch", { name: "Memory" })
    expect(switchControl.className).toContain("h-3.5")
    expect(switchControl.className).toContain("w-6")
    expect(
      switchControl.querySelector('[data-slot="switch-thumb"]')?.className
    ).toContain("size-2.5")
  })

  it("uses the success badge and forty-pixel data rows", () => {
    render(
      <>
        <Badge variant="success">Ready</Badge>
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Indexed</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </>
    )

    expect(screen.getByText("Ready").className).toContain("rounded-[6px]")
    expect(screen.getByText("Ready").className).toContain("bg-success-fill")
    expect(screen.getByRole("row").className).toContain("h-10")
  })
})
