/*
 * Deployment tombstone.
 *
 * The demonstration workspace was removed. Cloudways deploys by overlaying the
 * release onto its existing checkout, so a deleted file survives on the server
 * and keeps being type-checked. This path stays in source, empty, so the
 * overlay overwrites the old module instead of resurrecting it.
 */
export {};
