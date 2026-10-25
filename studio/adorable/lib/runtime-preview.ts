/** Resolving a saved preview must not prepare the VM for every JS/CSS request. */
export type RuntimePreview = {
  url: string;
  baseUrl: string;
  token: string | null;
  expiresAt: string | null;
};
export async function resolveRuntimePreview(
  fresh: boolean,
  services: {
    readState: () => Promise<{
      capturing: boolean;
      saved: RuntimePreview | null | undefined;
    }>;
    prepare: () => Promise<void>;
    issue: () => Promise<RuntimePreview>;
  },
) {
  // Always read this durable guard, including for cached assets. A preview
  // request must not wake a sandbox while it is capturing a recovery snapshot.
  const { capturing, saved } = await services.readState();
  if (capturing) throw Error("Project snapshot is being prepared.");
  if (!fresh) {
    if (
      saved &&
      (!saved.expiresAt || Date.parse(saved.expiresAt) > Date.now() + 3600000)
    )
      return saved;
  }
  await services.prepare();
  return services.issue();
}

/** Repair only an unavailable preview host; preserve genuine app errors. */
export async function fetchPreviewWithRecovery(
  request: () => Promise<Response>,
  recover: () => Promise<void>,
) {
  const response = await request();
  if (![502, 503, 504].includes(response.status)) return response;
  await response.body?.cancel();
  await recover();
  return request();
}
