/** A live HTTP preview is sufficient evidence of a warm runtime. */
export async function checkProjectReadiness(services: {
  capturing: () => Promise<boolean>;
  recordActivity: () => Promise<unknown>;
  probe: () => Promise<boolean>;
  repair: () => Promise<void>;
}) {
  if (await services.capturing()) return false;
  const [, ready] = await Promise.all([
    services.recordActivity(),
    services.probe(),
  ]);
  if (ready) return true;
  // The snapshot may have started while the health request was in flight.
  if (await services.capturing()) return false;
  await services.repair();
  if (await services.capturing()) return false;
  return services.probe();
}
