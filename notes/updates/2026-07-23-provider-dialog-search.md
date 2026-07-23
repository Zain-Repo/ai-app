# Provider dialog search and layout cleanup

## Outcome

Reworked the provider connection dialog into a flatter, separated list and
added an accessible search field that filters provider names, model families,
and connection types. Existing OAuth, ChatGPT subscription, OpenAI key, credit
status, and error behavior remains wired to the original handlers.

## Affected areas

- `src/components/provider-connect-dialog.tsx`
- `src/components/provider-connect-dialog.test.tsx`

## Validation

- `bun run typecheck`
- `bun run lint -- src/components/provider-connect-dialog.tsx src/components/provider-connect-dialog.test.tsx`
- `bun run test -- src/components/provider-connect-dialog.test.tsx`
- `bun run build`
- Focused Prettier check for both affected source files
- Deployed the production renderer to `app.a2zsoftware.ca` as Cloudflare
  version `2a5d29a3-460c-420f-8686-52be7fb3952a`
- Published the Windows updater assets as GitHub release `v0.1.5`
- Verified the remote installer, blockmap, and updater manifest SHA-256
  digests against the local release artifacts

## Limitations

The installed desktop app could be inspected, but a live visual pass of the
modified development build was blocked because the local Electron package is
incomplete and the local browser cannot use the production Clerk origin.
