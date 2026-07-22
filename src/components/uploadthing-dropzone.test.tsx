// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { UploadThingDropzone } from "./uploadthing-dropzone"

afterEach(cleanup)

describe("UploadThingDropzone", () => {
  it("uploads files dropped anywhere on the page", async () => {
    const onUpload = vi.fn(
      async (_files: File[], reportProgress: (progress: number) => void) => {
        reportProgress(100)
      }
    )
    const file = new File(["project notes"], "notes.md", {
      type: "text/markdown",
    })
    render(
      <UploadThingDropzone inputId="project-files" onUpload={onUpload}>
        <main>Project workspace</main>
      </UploadThingDropzone>
    )

    fireEvent.dragEnter(window, {
      dataTransfer: { files: [file], types: ["Files"] },
    })
    expect(screen.getByText("Drop files to add them")).toBeTruthy()

    fireEvent.drop(window, {
      dataTransfer: { files: [file], types: ["Files"] },
    })

    await waitFor(() => expect(onUpload).toHaveBeenCalledOnce())
    expect(onUpload.mock.calls[0]?.[0]).toEqual([file])
  })
})
