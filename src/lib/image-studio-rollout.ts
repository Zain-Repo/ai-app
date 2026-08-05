/**
 * Keeps the legacy image composer available as an emergency client-side
 * rollback while the additive backend schema remains safe to deploy.
 */
export const imageStudioV2Enabled =
  import.meta.env.VITE_IMAGE_STUDIO_V2 !== "false"
