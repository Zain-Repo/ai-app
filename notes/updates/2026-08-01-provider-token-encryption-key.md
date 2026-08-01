# Provider token encryption key

## Completed

- Generated a cryptographically secure 32-byte AES-GCM key in base64url form.
- Set it as `PROVIDER_TOKEN_ENCRYPTION_KEY` on the linked Convex local
  deployment `local-zain_ahmad-ai_app`.
- Kept the key out of source control, `.env.local`, logs, and documentation.

## Validation

- Confirmed the Convex environment listing includes
  `PROVIDER_TOKEN_ENCRYPTION_KEY`.
- Confirmed the configured key format matches the requirements enforced by
  `convex/providerCrypto.ts`.

## Limitation

- A fresh `convex dev --once` push could not be run because another Convex
  backend was already using port 3210. The existing process was left
  untouched.
