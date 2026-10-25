import { safetyEnabled } from "./safety-mode";
/** Enforced on the final gateway request, including automatic retries/fallbacks. */
export function privateProviderFetch(
  request: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    if (safetyEnabled() && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      body.provider = { ...body.provider, data_collection: "deny", zdr: true };
      init = { ...init, body: JSON.stringify(body) };
    }
    return request(input, init);
  };
}
