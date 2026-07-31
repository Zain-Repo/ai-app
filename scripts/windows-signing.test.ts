import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"

// @ts-expect-error Runtime signing hook is JavaScript for electron-builder.
import * as windowsSigning from "./windows-signing.mjs"

const { signArguments, signingConfiguration, validateSignatureInspection } =
  windowsSigning

describe("Windows signing command", () => {
  it("passes the certificate password through stdin instead of command arguments", () => {
    const args = signArguments("input.exe", "output.exe", {
      certificateFile: "certificate.pfx",
      certificatePassword: "do-not-log-this",
      description: "AI Harness",
      timestampServer: "http://timestamp.example",
      website: "https://example.com",
    })

    expect(args).toContain("-readpass")
    expect(args).toContain("-")
    expect(args).not.toContain("do-not-log-this")
  })

  it("accepts an existing certificate file", () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "ai-harness-signing-")
    )
    const certificateFile = path.join(directory, "certificate.pfx")
    fs.writeFileSync(certificateFile, "test")

    try {
      expect(
        signingConfiguration({
          WINDOWS_CERTIFICATE_FILE: certificateFile,
          WINDOWS_CERTIFICATE_PASSWORD: "password",
          WINDOWS_SIGN_PUBLISHER_NAME: "CN=AI Harness",
        })
      ).toMatchObject({
        certificateFile,
        website: "https://github.com/Zain-Repo/ai-app",
      })
    } finally {
      fs.rmSync(directory, { force: true, recursive: true })
    }
  })

  it("accepts an untrusted signer with the configured publisher", () => {
    expect(
      validateSignatureInspection(
        {
          status: "UnknownError",
          statusMessage: "The root certificate is not trusted",
          subject: "CN=AI Harness Test",
          issuer: "CN=AI Harness Test",
        },
        "CN=AI Harness Test"
      )
    ).toMatchObject({ subject: "CN=AI Harness Test" })

    expect(() =>
      validateSignatureInspection(
        {
          status: "HashMismatch",
          statusMessage: "The contents of the file have been altered",
          subject: "CN=AI Harness Test",
          issuer: "CN=AI Harness Test",
        },
        "CN=AI Harness Test"
      )
    ).toThrow("Authenticode signature validation failed")
  })
})
