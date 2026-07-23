import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const { sign: signDirectoryWithElectron } = require("@electron/windows-sign")

const DEFAULT_TIMESTAMP_SERVER = "http://timestamp.digicert.com"
const DEFAULT_WEBSITE = "https://github.com/Zain-Repo/ai-harness-releases"
const SIGNATURE_INSPECTION_SCRIPT = `
$signature = Get-AuthenticodeSignature -LiteralPath $env:AI_HARNESS_SIGNATURE_FILE -ErrorAction Stop
[pscustomobject]@{
  status = [string]$signature.Status
  statusMessage = [string]$signature.StatusMessage
  subject = if ($null -eq $signature.SignerCertificate) { $null } else { $signature.SignerCertificate.Subject }
  issuer = if ($null -eq $signature.SignerCertificate) { $null } else { $signature.SignerCertificate.Issuer }
} | ConvertTo-Json -Compress
`

function requiredEnvironmentValue(name, env) {
  const value = env[name]?.trim()
  if (!value) throw new Error(`Missing required signing environment: ${name}`)
  return value
}

export function signingConfiguration(env = process.env) {
  const certificateFile = path.resolve(
    requiredEnvironmentValue("WINDOWS_CERTIFICATE_FILE", env)
  )
  if (!fs.existsSync(certificateFile) || !fs.statSync(certificateFile).isFile())
    throw new Error("WINDOWS_CERTIFICATE_FILE does not point to a file")

  return {
    certificateFile,
    certificatePassword: requiredEnvironmentValue(
      "WINDOWS_CERTIFICATE_PASSWORD",
      env
    ),
    description: "AI Harness",
    publisherName: requiredEnvironmentValue("WINDOWS_SIGN_PUBLISHER_NAME", env),
    timestampServer:
      env.WINDOWS_TIMESTAMP_SERVER?.trim() || DEFAULT_TIMESTAMP_SERVER,
    toolPath: env.AI_HARNESS_OSSLSIGNCODE_PATH?.trim() || "osslsigncode",
    website: env.WINDOWS_SIGN_WEBSITE?.trim() || DEFAULT_WEBSITE,
  }
}

export function signArguments(inputPath, outputPath, config) {
  return [
    "sign",
    "-pkcs12",
    config.certificateFile,
    "-readpass",
    "-",
    "-h",
    "sha256",
    "-n",
    config.description,
    "-i",
    config.website,
    "-ts",
    config.timestampServer,
    "-in",
    inputPath,
    "-out",
    outputPath,
  ]
}

function runSigningTool(config, args, input) {
  const result = spawnSync(config.toolPath, args, {
    encoding: "utf8",
    input,
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  })
  if (result.error)
    throw new Error(`Unable to run osslsigncode: ${result.error.message}`)
  if (result.status !== 0)
    throw new Error(
      `osslsigncode failed with exit code ${result.status}: ${
        result.stderr.trim() || result.stdout.trim() || "no diagnostic output"
      }`
    )
}

function runPowerShellJson(script, env) {
  const result = spawnSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      env: { ...process.env, ...env },
      maxBuffer: 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  )
  if (result.error)
    throw new Error(
      `Unable to inspect Windows signing trust: ${result.error.message}`
    )
  if (result.status !== 0)
    throw new Error(
      `Windows signing trust inspection failed: ${
        result.stderr.trim() || result.stdout.trim() || "no diagnostic output"
      }`
    )
  try {
    return JSON.parse(result.stdout.trim())
  } catch {
    throw new Error("Windows signing trust inspection returned invalid data")
  }
}

export function validateSignatureInspection(inspection, publisherName) {
  if (inspection.status !== "Valid")
    throw new Error(
      `Windows does not trust the Authenticode signature (${inspection.status}): ${
        inspection.statusMessage || "no diagnostic output"
      }`
    )
  if (inspection.subject === inspection.issuer)
    throw new Error(
      "Self-signed Windows certificates are not allowed for release builds"
    )
  if (inspection.subject !== publisherName)
    throw new Error(
      `Signed file publisher does not match ${publisherName}: ${
        inspection.subject || "unsigned"
      }`
    )
  return inspection
}

export function assertTrustedSignature(filePath, publisherName) {
  const inspection = runPowerShellJson(SIGNATURE_INSPECTION_SCRIPT, {
    AI_HARNESS_SIGNATURE_FILE: path.resolve(filePath),
  })
  return validateSignatureInspection(inspection, publisherName)
}

export function assertSigningEnvironment(env = process.env) {
  const config = signingConfiguration(env)
  runSigningTool(config, ["--version"])
  return config
}

function signedOutputPath(filePath) {
  const extension = path.extname(filePath)
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, extension)}.signed-${randomUUID()}${extension}`
  )
}

function createSignedFile(filePath, config) {
  const outputPath = signedOutputPath(filePath)
  try {
    runSigningTool(
      config,
      signArguments(filePath, outputPath, config),
      `${config.certificatePassword}\n`
    )
    if (!fs.existsSync(outputPath) || !fs.statSync(outputPath).isFile())
      throw new Error("osslsigncode did not create the signed output")
    return outputPath
  } catch (error) {
    fs.rmSync(outputPath, { force: true })
    throw error
  }
}

function replaceWithSignedFile(filePath, signedPath) {
  const backupPath = `${filePath}.unsigned-${randomUUID()}`
  fs.renameSync(filePath, backupPath)
  try {
    fs.renameSync(signedPath, filePath)
    fs.rmSync(backupPath)
  } catch (error) {
    fs.rmSync(filePath, { force: true })
    fs.renameSync(backupPath, filePath)
    fs.rmSync(signedPath, { force: true })
    throw error
  }
}

async function signFileInPlace(filePath, config) {
  const signedPath = createSignedFile(filePath, config)
  try {
    assertTrustedSignature(signedPath, config.publisherName)
    replaceWithSignedFile(filePath, signedPath)
  } catch (error) {
    fs.rmSync(signedPath, { force: true })
    throw error
  }
  console.log(`Signed ${filePath}`)
}

export async function signDirectory(appDirectory, env = process.env) {
  const config = assertSigningEnvironment(env)
  const errors = []
  await signDirectoryWithElectron({
    appDirectory,
    hookFunction: async (filePath) => {
      try {
        await signFileInPlace(filePath, config)
      } catch (error) {
        errors.push(error)
        throw error
      }
    },
  })
  if (errors.length)
    throw new AggregateError(
      errors,
      "One or more application files failed signing"
    )
  return config
}

export async function sign(configuration) {
  const config = assertSigningEnvironment()
  await signFileInPlace(configuration.path, config)
}

async function main() {
  const mode = process.argv[2]
  if (mode === "--check") {
    assertSigningEnvironment()
    console.log("Windows signing environment is ready")
    return
  }
  if (mode === "--directory") {
    const appDirectory = process.argv[3]
    if (!appDirectory) throw new Error("Missing application directory")
    await signDirectory(path.resolve(appDirectory))
    return
  }
  throw new Error("Expected --check or --directory <path>")
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main()
