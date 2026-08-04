import { describe, expect, it } from "vitest"

// @ts-expect-error Runtime release publisher is JavaScript for Node.js.
import * as githubRelease from "./github-updater-release.mjs"

const { publishUpdaterRelease, UPDATER_REPOSITORY } = githubRelease
const target = "0123456789abcdef0123456789abcdef01234567"

function releaseJson({
  isDraft,
  assets = [],
  targetCommitish = target,
}: {
  isDraft: boolean
  assets?: string[]
  targetCommitish?: string
}) {
  return JSON.stringify({
    isDraft,
    tagName: "v1.2.3",
    targetCommitish,
    assets: assets.map((name) => ({ name })),
  })
}

describe("GitHub updater release publishing", () => {
  it("uploads every asset to a draft before publishing it as latest", () => {
    const calls: string[][] = []
    const views = [
      releaseJson({ isDraft: true }),
      releaseJson({
        isDraft: true,
        assets: [
          "setup.exe",
          "setup.exe.blockmap",
          "latest.yml",
          "runtime.json",
        ],
      }),
      releaseJson({
        isDraft: false,
        assets: [
          "setup.exe",
          "setup.exe.blockmap",
          "latest.yml",
          "runtime.json",
        ],
      }),
    ]
    const runGh = (args: string[]) => {
      calls.push(args)
      if (args[0] === "api")
        return args[1].endsWith("/releases/latest") ? "v1.2.3" : target
      return args[1] === "view" ? (views.shift() ?? "") : ""
    }

    publishUpdaterRelease({
      runGh,
      tag: "v1.2.3",
      target,
      title: "Dev3 1.2.3",
      notes: "Release notes",
      assets: [
        "out/setup.exe",
        "out/setup.exe.blockmap",
        "out/latest.yml",
        "out/runtime.json",
      ],
    })

    expect(calls.map((args) => args.slice(0, 2))).toEqual([
      ["release", "view"],
      ["release", "upload"],
      ["release", "view"],
      ["release", "edit"],
      ["release", "view"],
      ["api", `repos/${UPDATER_REPOSITORY}/releases/latest`],
    ])
    expect(calls[1]).toContain("--clobber")
    expect(calls[3]).toContain("--draft=false")
    expect(calls[3]).toContain("--latest")
    expect(calls.flat()).not.toContain("ai-harness-releases")
    expect(calls.flat()).toContain(UPDATER_REPOSITORY)
  })

  it("creates a missing release as a draft", () => {
    const calls: string[][] = []
    const missingRelease = Object.assign(new Error("release not found"), {
      stderr: "release not found",
    })
    const views: Array<string | Error> = [
      missingRelease,
      releaseJson({ isDraft: true }),
      releaseJson({ isDraft: true, assets: ["latest.yml"] }),
      releaseJson({ isDraft: false, assets: ["latest.yml"] }),
    ]
    const runGh = (args: string[]) => {
      calls.push(args)
      if (args[0] === "api") {
        if (args[1].endsWith("/releases/latest")) return "v1.2.3"
        throw Object.assign(new Error("HTTP 404: Not Found"), {
          stderr: "gh: Not Found (HTTP 404)",
        })
      }
      if (args[1] !== "view") return ""
      const response = views.shift()
      if (response instanceof Error) throw response
      return response ?? ""
    }

    publishUpdaterRelease({
      runGh,
      tag: "v1.2.3",
      target,
      title: "Dev3 1.2.3",
      notes: "Release notes",
      assets: ["out/latest.yml"],
    })

    const createCall = calls.find((args) => args[1] === "create")
    expect(createCall).toContain("--draft")
    expect(createCall).toContain("--target")
    expect(createCall).toContain(target)
  })

  it("leaves the release as a draft when an expected asset is missing", () => {
    const calls: string[][] = []
    const views = [
      releaseJson({ isDraft: true }),
      releaseJson({ isDraft: true, assets: ["setup.exe"] }),
    ]
    const runGh = (args: string[]) => {
      calls.push(args)
      if (args[0] === "api") return target
      return args[1] === "view" ? (views.shift() ?? "") : ""
    }

    expect(() =>
      publishUpdaterRelease({
        runGh,
        tag: "v1.2.3",
        target,
        title: "Dev3 1.2.3",
        notes: "Release notes",
        assets: ["out/setup.exe", "out/latest.yml"],
      })
    ).toThrow("missing assets: latest.yml")
    expect(calls.some((args) => args[1] === "edit")).toBe(false)
  })

  it("leaves the release as a draft when it contains a stale asset", () => {
    const calls: string[][] = []
    const views = [
      releaseJson({ isDraft: true }),
      releaseJson({
        isDraft: true,
        assets: ["latest.yml", "obsolete-installer.exe"],
      }),
    ]
    const runGh = (args: string[]) => {
      calls.push(args)
      if (args[0] === "api") return target
      return args[1] === "view" ? (views.shift() ?? "") : ""
    }

    expect(() =>
      publishUpdaterRelease({
        runGh,
        tag: "v1.2.3",
        target,
        title: "Dev3 1.2.3",
        notes: "Release notes",
        assets: ["out/latest.yml"],
      })
    ).toThrow("unexpected assets: obsolete-installer.exe")
    expect(calls.some((args) => args[1] === "edit")).toBe(false)
  })

  it("refuses to modify an already-published release", () => {
    const calls: string[][] = []
    const runGh = (args: string[]) => {
      calls.push(args)
      return releaseJson({ isDraft: false })
    }

    expect(() =>
      publishUpdaterRelease({
        runGh,
        tag: "v1.2.3",
        target,
        title: "Dev3 1.2.3",
        notes: "Release notes",
        assets: ["out/latest.yml"],
      })
    ).toThrow("already published")
    expect(calls).toHaveLength(1)
  })

  it("refuses to upload when a reused draft targets another commit", () => {
    const calls: string[][] = []
    const runGh = (args: string[]) => {
      calls.push(args)
      return releaseJson({
        isDraft: true,
        targetCommitish: "abcdef0123456789abcdef0123456789abcdef01",
      })
    }

    expect(() =>
      publishUpdaterRelease({
        runGh,
        tag: "v1.2.3",
        target,
        title: "Dev3 1.2.3",
        notes: "Release notes",
        assets: ["out/latest.yml"],
      })
    ).toThrow(`expected ${target}`)
    expect(calls.some((args) => args[1] === "upload")).toBe(false)
  })

  it("refuses a mutable branch target before uploading", () => {
    const calls: string[][] = []
    const runGh = (args: string[]) => {
      calls.push(args)
      return releaseJson({ isDraft: true, targetCommitish: "master" })
    }

    expect(() =>
      publishUpdaterRelease({
        runGh,
        tag: "v1.2.3",
        target,
        title: "Dev3 1.2.3",
        notes: "Release notes",
        assets: ["out/latest.yml"],
      })
    ).toThrow("does not target an immutable commit SHA")
    expect(calls.some((args) => args[1] === "upload")).toBe(false)
  })
})
