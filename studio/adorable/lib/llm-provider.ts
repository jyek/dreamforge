import { withEmptyResponseRetry } from "./empty-response-retry";
import { withQuotaFallback } from "./quota-fallback";
import { DEFAULT_CODING_MODEL, QUOTA_FALLBACK_MODEL } from "./allowed-models";
import { createAnthropic } from "@ai-sdk/anthropic";
import {
  createOpenAI,
  type OpenAIResponsesProviderOptions,
} from "@ai-sdk/openai";
import {
  stepCountIs,
  streamText,
  type UIMessage,
  type ToolSet,
  convertToModelMessages,
} from "ai";

import { normalizeModelHistory } from "./model-history";
import { createModelRouting } from "./model-routing";
import type { ModelChoice } from "./model-catalog";

type LlmProviderName = "openai" | "anthropic";

const getProviderName = (override?: string): LlmProviderName => {
  const value = (override ?? process.env["LLM_PROVIDER"])?.toLowerCase().trim();
  if (value === "anthropic" || value === "claude") return "anthropic";
  return "openai";
};

type StreamLlmResponseParams = {
  system: string;
  messages: UIMessage[];
  tools: ToolSet;
  beforeStep?: (messages: unknown) => Promise<void>;
  afterStep?: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    modelId?: string;
  }) => Promise<void>;
  onStreamError?: () => Promise<void>;
  apiKey?: string;
  providerOverride?: string;
  maxSteps?: number;
  modelChoice?: ModelChoice;
  modelOverride?: string;
};

type StreamLlmResponseResult = {
  result: ReturnType<typeof streamText>;
  provider: LlmProviderName;
  routing?: ReturnType<typeof createModelRouting>;
};

export const streamLlmResponse = async ({
  system,
  messages,
  tools,
  apiKey,
  providerOverride,
  beforeStep,
  afterStep,
  onStreamError,
  maxSteps = 5,
  modelChoice,
  modelOverride,
}: StreamLlmResponseParams): Promise<StreamLlmResponseResult> => {
  system += "\nWhen the user asks you to build or change the app, carry out the changes with the tools in this turn. A plan, file inspection, or promise to implement later is not completion. Continue from successful tool results without asking the user to say continue. Before ending, either summarize the implemented result and checks, or explicitly explain the blocker and what remains incomplete. For questions, answer directly without unnecessary edits.";
  const provider = getProviderName(providerOverride);
  const modelMessages = normalizeModelHistory(
    await convertToModelMessages(messages),
  );
  const stepLimit = Math.max(2, Math.min(20, Math.floor(maxSteps)));
  const prepareStep = async ({
    messages,
    stepNumber,
  }: {
    messages: unknown;
    stepNumber: number;
  }) => {
    await beforeStep?.(messages);
    // Always leave one model call for an answer after the last tool result.
    if (stepNumber >= stepLimit - 1)
      return {
        toolChoice: "none" as const,
        system:
          system +
          "\nThis is your final step. Do not call tools. Give a brief written answer based on the results so far. Clearly say if the requested task remains incomplete or checks failed; never claim success without evidence.",
      };
    return {};
  };

  if (provider === "openai") {
    const baseURL = process.env["OPENAI_BASE_URL"];
    const routing =
      modelChoice && baseURL?.includes("openrouter.ai")
        ? createModelRouting(
            modelChoice,
            apiKey || process.env.OPENROUTER_API_KEY!,
          )
        : undefined;
    const openaiProvider = createOpenAI({
      ...(routing ? { fetch: routing.fetch } : {}),
      apiKey:
        apiKey ||
        process.env["OPENROUTER_API_KEY"] ||
        process.env["OPENAI_API_KEY"],
      ...(baseURL ? { baseURL } : {}),
    });
    const modelName =
      modelOverride || process.env["LLM_MODEL"] || "gpt-5.3-codex";
    const model = baseURL
      ? openaiProvider.chat(modelName)
      : openaiProvider.responses(modelName);
    const routedModel =
      !routing && baseURL && modelName === DEFAULT_CODING_MODEL
        ? withQuotaFallback(
            openaiProvider.chat(modelName),
            openaiProvider.chat(QUOTA_FALLBACK_MODEL),
          )
        : model;
    const result = streamText({
      system,
      model: withEmptyResponseRetry(routedModel),
      messages: modelMessages,
      maxOutputTokens: Number(process.env["LLM_MAX_OUTPUT_TOKENS"] || 4096),
      tools,
      prepareStep,
      maxRetries: routing ? 0 : 2,
      onError: async () => {
        await onStreamError?.();
      },
      onStepFinish: async ({ usage, response }) => {
        await afterStep?.({ ...usage, modelId: response.modelId });
      },
      providerOptions: {
        openai: {
          reasoningEffort: "low",
        } satisfies OpenAIResponsesProviderOptions,
      },
      stopWhen: stepCountIs(stepLimit),
    });

    return {
      result,
      provider,
      routing,
    };
  }

  const anthropicProvider = apiKey
    ? createAnthropic({ apiKey })
    : createAnthropic({});
  const result = streamText({
    system,
    model: anthropicProvider("claude-sonnet-4-20250514"),
    messages: modelMessages,
    tools,
    prepareStep,
    onStepFinish: async ({ usage, response }) => {
      await afterStep?.({ ...usage, modelId: response.modelId });
    },
    stopWhen: stepCountIs(stepLimit),
  });

  return {
    result,
    provider,
  };
};
