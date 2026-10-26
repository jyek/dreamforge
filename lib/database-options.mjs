// During rollout, the current schema remains readable until the rename commits.
// Omit public so a missing app schema cannot silently select legacy tables.
export const APPLICATION_DATABASE_OPTIONS =
  "-c search_path=dreamforge,adorable,extensions";
