import { MODELS, type ModelChoice } from "./model-catalog";
export class ModelRoutingError extends Error {}
type Dependencies = {
  request: typeof fetch;
  quota?: () => Promise<{ remaining: number }>;
};
export function createModelRouting(
  choice: ModelChoice,
  key: string,
  overrides: Partial<Dependencies> = {},
) {
  const deps: Dependencies = {
    request: fetch,
    ...overrides,
  };
  const state = { usedModel: "", modelsUsed: [] as string[] };
  const routedFetch: typeof fetch = async (input, init) => {
    if (!init?.body || typeof init.body !== "string")
      throw new ModelRoutingError("Unsupported model request.");
    const original = JSON.parse(init.body);
    const target = MODELS[choice];
    if (!target)
      throw new ModelRoutingError("Choose an available coding model.");
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
      if (model === MODELS.sonnet || model === MODELS.haiku) {
        // Sonnet 5.5 rejects forced tool use and sampling overrides. The harness
        // still requires recorded file-edit evidence before confirming success.
        if (model === MODELS.sonnet && body.tool_choice !== "none")
          body.tool_choice = "auto";
        delete body.temperature;
        delete body.top_p;
        delete body.top_k;
      }
      if (
        model === MODELS.sonnet ||
        model === MODELS.haiku ||
        model === MODELS.sol ||
        model === MODELS.luna ||
        model === MODELS["gemini-lite"] ||
        model === MODELS.gemini
      ) {
        delete body.reasoning_effort;
        body.reasoning = {
          effort: "low",
          ...(responses ? {} : { exclude: true }),
        };
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
      if (otherMedia)
        throw new ModelRoutingError(
          "Attach images rather than audio or video.",
        );
      body.provider = {
        sort: model === MODELS.glm ? "throughput" : "price",
        require_parameters: true,
        max_price: {
          prompt: model.input,
          completion: model.output,
          request: 0,
          ...(model.id.startsWith("google/") ? {} : { image: 0 }),
        },
      };
      const response = await deps.request(input, {
        ...init,
        body: JSON.stringify(body),
      });
      if (!response.ok) return response;
      state.usedModel = model.id;
      if (!state.modelsUsed.includes(model.id)) state.modelsUsed.push(model.id);
      return response;
    };
    return send(target);
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
