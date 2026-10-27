import { privateProviderFetch } from "./provider-privacy";
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

import { compactPastToolHistory, normalizeModelHistory } from "./model-history";
import { createModelRouting } from "./model-routing";
import type { ModelChoice } from "./model-catalog";
import {
  requestsProjectEdit,
  successfulProjectEdit,
  PROJECT_EDIT_TOOLS,
} from "./project-edit-request";

type LlmProviderName = "openai" | "anthropic";

const getProviderName = (override?: string): LlmProviderName => {
  const value = (override ?? process.env["LLM_PROVIDER"])?.toLowerCase().trim();
  if (value === "anthropic" || value === "claude") return "anthropic";
  return "openai";
};

type StreamLlmResponseParams = {
  abortSignal?: AbortSignal;
  system: string;
  messages: UIMessage[];
  tools: ToolSet;
  beforeStep?: (messages: unknown) => Promise<void>;
  afterStep?: (usage: {
    inputTokens?: number;
    outputTokens?: number;
    modelId?: string;
    inputTokenDetails?: { cacheReadTokens?: number; cacheWriteTokens?: number };
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
  requiresEdits: boolean;
};

export const streamLlmResponse = async ({
  abortSignal,
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
  system +=
    "\nOlder tool payloads are omitted from prior turns to keep context small. Read the current project files before changing them; never assume an old file listing is current.\nKeep each code write small: start with a working scaffold, split large games into small modules, and add features with focused patches. Never put an entire large game into one tool call. When the user asks you to build or change the app, carry out the changes with the tools in this turn. A plan, file inspection, or promise to implement later is not completion. Continue from successful tool results without asking the user to say continue. Before ending, either summarize the implemented result and checks, or explicitly explain the blocker and what remains incomplete. For questions, answer directly without unnecessary edits.";
  const provider = getProviderName(providerOverride);
  const modelMessages = normalizeModelHistory(
    compactPastToolHistory(await convertToModelMessages(messages)),
  );
  const stepLimit = Math.max(2, Math.min(20, Math.floor(maxSteps)));
  const requiresEdits =
    requestsProjectEdit(messages) &&
    Object.keys(tools).some((name) => PROJECT_EDIT_TOOLS.has(name));
  let editRecorded = false;
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
    if (requiresEdits && !editRecorded)
      return {
        toolChoice: "required" as const,
        system:
          system +
          "\nThis is an explicit project edit request and no successful file-editing action has been recorded in this turn. Inspect the current files as needed, then apply the requested change with the file-editing tools. Text describing a change does not apply it. Do not substitute a terminal command for file-editing evidence.",
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
            { request: privateProviderFetch() },
          )
        : undefined;
    const openaiProvider = createOpenAI({
      ...(routing
        ? { fetch: routing.fetch }
        : baseURL?.includes("openrouter.ai")
          ? { fetch: privateProviderFetch() }
          : {}),
      apiKey:
        apiKey ||
        process.env["OPENROUTER_API_KEY"] ||
        process.env["OPENAI_API_KEY"],
      ...(baseURL ? { baseURL } : {}),
    });
    const modelName =
      modelOverride || process.env["LLM_MODEL"] || "gpt-5.3-codex";
    const model =
      baseURL && modelChoice !== "sol" && modelChoice !== "luna"
        ? openaiProvider.chat(modelName)
        : openaiProvider.responses(modelName);
    const routedModel =
      !routing && baseURL && modelName === "cohere/north-mini-code:free"
        ? withQuotaFallback(
            openaiProvider.chat(modelName),
            openaiProvider.chat(QUOTA_FALLBACK_MODEL),
          )
        : model;
    const result = streamText({
      abortSignal,
      system,
      model: withEmptyResponseRetry(routedModel, async ({ usage, prompt }) => {
        // Settle the first call and reserve the recovery separately. A retry
        // cannot bypass the wallet or Stop, and its tokens are never counted twice.
        const tokens = usage as {
          inputTokens?: {
            total?: number;
            cacheRead?: number;
            cacheWrite?: number;
          };
          outputTokens?: { total?: number };
        };
        await afterStep?.({
          inputTokens: tokens.inputTokens?.total,
          inputTokenDetails: {
            cacheReadTokens: tokens.inputTokens?.cacheRead,
            cacheWriteTokens: tokens.inputTokens?.cacheWrite,
          },
          outputTokens: tokens.outputTokens?.total,
          modelId: routing?.state.usedModel || modelName,
        });
        await beforeStep?.(prompt);
        return Boolean(afterStep);
      }),
      messages: modelMessages,
      maxOutputTokens: Number(process.env["LLM_MAX_OUTPUT_TOKENS"] || 4096),
      tools,
      prepareStep,
      maxRetries: routing ? 0 : 2,
      timeout: { stepMs: 90000, totalMs: 240000 },
      onAbort: async () => {
        await onStreamError?.();
      },
      onError: async () => {
        await onStreamError?.();
      },
      onStepFinish: async ({ usage, response, toolResults }) => {
        editRecorded ||= toolResults.some((result) =>
          successfulProjectEdit(result.toolName, result.output),
        );
        await afterStep?.({
          ...usage,
          modelId: routing?.state.usedModel || response.modelId,
        });
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
      requiresEdits,
    };
  }

  const anthropicProvider = apiKey
    ? createAnthropic({ apiKey })
    : createAnthropic({});
  const result = streamText({
    abortSignal,
    system,
    model: anthropicProvider("claude-sonnet-4-20250514"),
    onError: async () => {
      await onStreamError?.();
    },
    messages: modelMessages,
    tools,
    prepareStep,
    timeout: { stepMs: 90000, totalMs: 240000 },
    onAbort: async () => {
      await onStreamError?.();
    },
    onStepFinish: async ({ usage, response, toolResults }) => {
      editRecorded ||= toolResults.some((result) =>
        successfulProjectEdit(result.toolName, result.output),
      );
      await afterStep?.({
        ...usage,
        modelId: response.modelId,
      });
    },
    stopWhen: stepCountIs(stepLimit),
  });

  return {
    result,
    provider,
    requiresEdits,
  };
};
