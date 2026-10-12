import { MODELS, type ModelChoice } from "./model-catalog";
export class ModelRoutingError extends Error {}
export async function freeQuota(
  apiKey = process.env.OPENROUTER_API_KEY!,
  request = fetch,
) {
  const response = await request("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new ModelRoutingError(
      "Could not check free quota. Try again, or select Qwen explicitly.",
    );
  const data = (await response.json()).data?.free_model_daily_requests;
  if (!data || !Number.isFinite(data.remaining))
    throw new ModelRoutingError(
      "OpenRouter did not report the free quota. Try again, or select Qwen explicitly.",
    );
  return data as { used: number; limit: number; remaining: number };
}
type Dependencies = {
  request: typeof fetch;
  quota: () => Promise<{ remaining: number }>;
};
export function createModelRouting(
  choice: ModelChoice,
  key: string,
  overrides: Partial<Dependencies> = {},
) {
  const deps: Dependencies = {
    request: fetch,
    quota: () => freeQuota(key),
    ...overrides,
  };
  let exhausted = false;
  const state = { usedModel: "", modelsUsed: [] as string[] };
  const routedFetch: typeof fetch = async (input, init) => {
    if (!init?.body || typeof init.body !== "string")
      throw new ModelRoutingError("Unsupported model request.");
    const original = JSON.parse(init.body);
    let target =
      choice === "auto" || choice === "free" ? MODELS.free : MODELS[choice];
    if (choice === "auto" || choice === "free") {
      if (!exhausted) exhausted = (await deps.quota()).remaining <= 0;
      if (exhausted) {
        if (choice === "free")
          throw new ModelRoutingError(
            "Your daily free quota is used up. Choose Auto or Qwen to continue with a paid model.",
          );
        target = MODELS.qwen;
      }
    }
    const send = async (model: (typeof MODELS)[keyof typeof MODELS]) => {
      const body = { ...original, model: model.id };
      delete body.models;
      body.max_tokens = Math.min(
        8192,
        Math.max(
          1,
          Number(body.max_completion_tokens || body.max_tokens || 8192),
        ),
      );
      delete body.max_completion_tokens;
      if (model === MODELS.qwen) delete body.reasoning_effort;
      if (model !== MODELS.free) {
        if (
          /"type"\s*:\s*"(?:image_url|input_audio|video_url)"/.test(
            JSON.stringify(body.messages),
          )
        )
          throw new ModelRoutingError(
            "Paid model routing currently supports text prompts only.",
          );
        body.provider = {
          sort: "price",
          require_parameters: true,
          max_price: {
            prompt: model.input,
            completion: model.output,
            request: 0,
            image: 0,
          },
        };
      }
      const response = await deps.request(input, {
        ...init,
        body: JSON.stringify(body),
      });
      if (!response.ok) return response;
      state.usedModel = model.id;
      if (!state.modelsUsed.includes(model.id)) state.modelsUsed.push(model.id);
      return response;
    };
    const response = await send(target);
    if (
      choice === "auto" &&
      target === MODELS.free &&
      response.status === 429
    ) {
      // Provider congestion is not permission to spend. Only confirmed daily
      // exhaustion permits switching to a paid model.
      if ((await deps.quota()).remaining <= 0) {
        exhausted = true;
        await response.body?.cancel();
        return send(MODELS.qwen);
      }
    }
    return response;
  };
  return { fetch: routedFetch, state };
}
export function modelErrorMessage(error: unknown): string | undefined {
  if (error instanceof ModelRoutingError) return error.message;
  if (error && typeof error === "object") {
    const value = error as { cause?: unknown; lastError?: unknown };
    return modelErrorMessage(value.cause) || modelErrorMessage(value.lastError);
  }
}
