import path from "node:path"

export const UPDATER_REPOSITORY = "Zain-Repo/ai-app"
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i

function releaseViewArguments(tag) {
  return [
    "release",
    "view",
    tag,
    "--repo",
    UPDATER_REPOSITORY,
    "--json",
    "assets,isDraft,tagName,targetCommitish",
  ]
}

function parseRelease(rawRelease) {
  const release = JSON.parse(rawRelease)
  if (
    !release ||
    typeof release !== "object" ||
    typeof release.isDraft !== "boolean" ||
    typeof release.tagName !== "string" ||
    typeof release.targetCommitish !== "string" ||
    !Array.isArray(release.assets) ||
    release.assets.some(
      (asset) =>
        !asset || typeof asset !== "object" || typeof asset.name !== "string"
    )
  )
    throw new Error("GitHub returned invalid release metadata")

  return release
}

function releaseNotFound(error) {
  if (!error || typeof error !== "object") return false
  const stderr =
    typeof error.stderr === "string"
      ? error.stderr
      : Buffer.isBuffer(error.stderr)
        ? error.stderr.toString("utf8")
        : ""
  const message = error instanceof Error ? error.message : ""
  return /release not found/i.test(`${stderr}\n${message}`)
}

function githubResourceNotFound(error) {
  if (!error || typeof error !== "object") return false
  const stderr =
    typeof error.stderr === "string"
      ? error.stderr
      : Buffer.isBuffer(error.stderr)
        ? error.stderr.toString("utf8")
        : ""
  const message = error instanceof Error ? error.message : ""
  return /(?:HTTP 404|not found)/i.test(`${stderr}\n${message}`)
}

function viewRelease(runGh, tag) {
  try {
    return parseRelease(runGh(releaseViewArguments(tag)))
  } catch (error) {
    if (releaseNotFound(error)) return undefined
    throw error
  }
}

export function assertExpectedAssets(release, assets) {
  const expectedNames = assets.map((asset) => path.basename(asset))
  const uniqueExpectedNames = new Set(expectedNames)
  if (uniqueExpectedNames.size !== expectedNames.length)
    throw new Error("Updater assets must have unique file names")

  const uploadedNames = new Set(release.assets.map((asset) => asset.name))
  const missingNames = expectedNames.filter((name) => !uploadedNames.has(name))
  if (missingNames.length > 0)
    throw new Error(
      `GitHub release is missing assets: ${missingNames.join(", ")}`
    )
  const unexpectedNames = [...uploadedNames].filter(
    (name) => !uniqueExpectedNames.has(name)
  )
  if (unexpectedNames.length > 0)
    throw new Error(
      `GitHub release has unexpected assets: ${unexpectedNames.join(", ")}`
    )
}

export function publishUpdaterRelease({
  runGh,
  tag,
  target,
  title,
  notes,
  assets,
}) {
  if (!COMMIT_SHA_PATTERN.test(target))
    throw new Error("Release target must be a full 40-character commit SHA")

  let release = viewRelease(runGh, tag)
  if (!release) {
    runGh([
      "release",
      "create",
      tag,
      "--repo",
      UPDATER_REPOSITORY,
      "--draft",
      "--target",
      target,
      "--title",
      title,
      "--notes",
      notes,
    ])
    release = viewRelease(runGh, tag)
    if (!release) throw new Error(`GitHub draft release ${tag} was not created`)
  }

  if (!release.isDraft)
    throw new Error(
      `GitHub release ${tag} is already published; refusing to replace its updater assets`
    )

  let tagTarget
  try {
    tagTarget = runGh([
      "api",
      `repos/${UPDATER_REPOSITORY}/commits/${encodeURIComponent(tag)}`,
      "--jq",
      ".sha",
    ]).trim()
  } catch (error) {
    if (
      !githubResourceNotFound(error) ||
      !COMMIT_SHA_PATTERN.test(release.targetCommitish)
    )
      throw error
    tagTarget = release.targetCommitish
  }
  if (tagTarget.toLowerCase() !== target.toLowerCase())
    throw new Error(
      `GitHub release ${tag} targets ${tagTarget || "an unknown commit"}, expected ${target}`
    )

  runGh([
    "release",
    "upload",
    tag,
    ...assets,
    "--repo",
    UPDATER_REPOSITORY,
    "--clobber",
  ])

  const uploadedRelease = viewRelease(runGh, tag)
  if (!uploadedRelease || !uploadedRelease.isDraft)
    throw new Error(`GitHub release ${tag} is no longer a draft`)
  assertExpectedAssets(uploadedRelease, assets)

  runGh([
    "release",
    "edit",
    tag,
    "--repo",
    UPDATER_REPOSITORY,
    "--draft=false",
    "--latest",
  ])

  const publishedRelease = viewRelease(runGh, tag)
  if (!publishedRelease || publishedRelease.isDraft)
    throw new Error(`GitHub release ${tag} was not published`)
  assertExpectedAssets(publishedRelease, assets)

  const latestTag = runGh([
    "api",
    `repos/${UPDATER_REPOSITORY}/releases/latest`,
    "--jq",
    ".tag_name",
  ]).trim()
  if (latestTag !== tag)
    throw new Error(
      `GitHub release ${tag} was published but ${latestTag || "no release"} is latest`
    )
}
