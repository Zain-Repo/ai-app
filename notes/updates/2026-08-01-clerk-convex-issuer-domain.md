# Clerk and Convex issuer-domain setup

## Completed

- Added the Clerk Frontend API URL for the configured development instance to
  the local `.env.local` as `CLERK_JWT_ISSUER_DOMAIN`.
- Updated the local configuration to target the cloud development deployment
  `brazen-aardvark-376`, rather than a local Convex deployment.
- Verified the cloud environment contains `CLERK_JWT_ISSUER_DOMAIN`.
- Kept `convex/auth.config.ts` environment-driven so the issuer remains
  deployment-specific and no credential is committed.

## Validation

- Confirmed the configured Clerk issuer exposes a healthy OpenID
  configuration document.
- Confirmed the cloud environment variable metadata reports
  `CLERK_JWT_ISSUER_DOMAIN`.
- Confirmed the local cloud-selector variables are present and point to
  non-local Convex endpoints.
- Confirmed the application build and Convex function metadata checks
  succeeded against the cloud development configuration.

## Limitation

- No Convex code deployment was performed as part of this configuration and
  verification work.
