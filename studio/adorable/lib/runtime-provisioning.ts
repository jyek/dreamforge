/** Creation refusals must reach the caller immediately. The general SDK retries
 * some 503 refusals until its five-minute deadline, hiding the useful error. */
export async function requestSandboxCreation(
  input: Record<string, unknown>,
  dependencies: {
    request?: typeof fetch;
    apiKey?: string;
    baseUrl?: string;
  } = {},
) {
  const request = dependencies.request || fetch;
  const apiKey = dependencies.apiKey || process.env.RUNTIME_API_KEY;
  if (!apiKey)
    throw Object.assign(Error("Project hosting is not configured."), {
      code: "hosting_not_configured",
    });
  const response = await request(
    new URL(
      "/v1/sandboxes",
      dependencies.baseUrl ||
        process.env.RUNTIME_API_URL ||
        "https://api.withruntime.com",
    ),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": String(input.name),
      },
      body: JSON.stringify(input),
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    },
  );
  const result = await response.json();
  if (!response.ok || result.error)
    throw Object.assign(Error("Project hosting refused creation."), {
      code: result.error?.code || "hosting_unavailable",
      status: result.error?.status || response.status,
      details: result.error?.details,
    });
  if (typeof result.id !== "string" || !/^[a-f0-9-]{36}$/i.test(result.id))
    throw Object.assign(Error("Invalid project hosting response."), {
      code: "hosting_invalid_response",
    });
  return result.id as string;
}
