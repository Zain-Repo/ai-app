# Publish Windows releases without code signing

## Context

The Windows release pipeline previously required an Authenticode certificate,
certificate password, publisher identity, timestamp service, and external
signing utility. The certificate and signing behavior introduced operational
complexity and runner-specific failures that blocked otherwise valid releases.

## Decision

Package and publish the AI Harness Windows application and NSIS installer
without Authenticode signing. CI-success gating, exact tested-commit checks,
atomic draft publication, release artifact retention, and the fixed
`Zain-Repo/ai-app` destination remain mandatory.

## Consequences

- GitHub Actions and local packaging require no signing certificates, passwords,
  publisher identities, timestamp servers, or signing utilities.
- Packaging removes ambient certificate variables and custom signing hooks so
  a runner or developer machine cannot silently re-enable signing.
- Windows identifies the application publisher as unknown and may show a
  SmartScreen warning during installation.
- Removing signing must not weaken release provenance checks or permit a release
  from a commit other than the successful `master` CI commit.

## Evidence

- The reusable release workflow accepts only the tested commit SHA and no
  signing secrets.
- The release workflow verifies `origin/master` before packaging and again
  immediately before atomic publication to `Zain-Repo/ai-app`.
