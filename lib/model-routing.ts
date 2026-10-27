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
      "Could not check free quota. Try again, or select GLM explicitly.",
    );
  const data = (await response.json()).data?.free_model_daily_requests;
  if (!data || !Number.isFinite(data.remaining))
    throw new ModelRoutingError(
      "OpenRouter did not report the free quota. Try again, or select GLM explicitly.",
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
            "Your daily free quota is used up. Choose Auto or GLM to continue with a paid model.",
          );
        target = MODELS.glm;
      }
    }
    const send = async (model: (typeof MODELS)[keyof typeof MODELS]) => {
      const body = { ...original, model: model.id };
      delete body.models;
      const responses = Object.hasOwn(body, "input");
      const maxOutput = Math.min(
        8192,
        Math.max(
          1,
          Number(
            body.max_output_tokens ||
              body.max_completion_tokens ||
              body.max_tokens ||
              8192,
          ),
        ),
      );
      delete body.max_tokens;
      delete body.max_completion_tokens;
      delete body.max_output_tokens;
      if (responses) {
        body.max_output_tokens = maxOutput;
        body.store = false;
        delete body.previous_response_id;
      } else body.max_tokens = maxOutput;
      if (model === MODELS.sonnet) {
        // Sonnet 5.5 rejects forced tool use and sampling overrides. The harness
        // still requires recorded file-edit evidence before confirming success.
        if (body.tool_choice !== "none") body.tool_choice = "auto";
        delete body.temperature;
        delete body.top_p;
        delete body.top_k;
      }
      if (
        model === MODELS.sonnet ||
        model === MODELS.sol ||
        model === MODELS["glm-advanced"]
      ) {
        delete body.reasoning_effort;
        body.reasoning = {
          effort: "low",
          ...(responses ? {} : { exclude: true }),
        };
      }
      // DeepSeek exposes optional reasoning; disable it for responsive coding
      // rather than letting thinking consume the entire completion budget.
      if (model === MODELS.deepseek) {
        delete body.reasoning_effort;
        body.reasoning = { enabled: false, exclude: true };
      }
      if (model === MODELS.glm) {
        delete body.reasoning_effort;
        body.reasoning = { effort: "low", exclude: true };
      }
      const visual = /"type"\s*:\s*"(?:image_url|input_image)"/.test(
        JSON.stringify(body.messages || body.input),
      );
      const otherMedia = /"type"\s*:\s*"(?:input_audio|video_url)"/.test(
        JSON.stringify(body.messages || body.input),
      );
      if (
        otherMedia ||
        (visual &&
          model !== MODELS.deepseek &&
          model !== MODELS.glm &&
          model !== MODELS.sonnet &&
          model !== MODELS.sol)
      )
        throw new ModelRoutingError(
          "Choose an image-capable model, such as GLM 5.3 Flash, Claude Sonnet 5.5 or GPT-6.1 Sol. GLM 5.3 [1M] accepts text only.",
        );
      if (model !== MODELS.free) {
        body.provider = {
          sort: model === MODELS.glm ? "throughput" : "price",
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
        return send(MODELS.glm);
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
