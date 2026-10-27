export type ModelTier = "basic" | "advanced";
export const MODEL_CHOICES = [
  { id: "auto", label: "Auto" },
  { id: "free", label: "Cohere North Mini Code" },
  { id: "glm", label: "GLM 5.3 Flash" },
  { id: "deepseek", label: "DeepSeek V4.1 Flash" },
  { id: "sonnet", label: "Claude Sonnet 5.5" },
  { id: "sol", label: "GPT-6.1 Sol" },
  { id: "glm-advanced", label: "GLM 5.3 [1M]" },
] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number]["id"];
export const isModelChoice = (value: unknown): value is ModelChoice =>
  MODEL_CHOICES.some((choice) => choice.id === value);
export const MODELS = {
  free: {
    id: "cohere/north-mini-code:free",
    label: "Cohere North Mini Code",
    input: 0,
    output: 0,
  },
  glm: {
    id: "z-ai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    input: 0.15,
    output: 0.5,
  },
  deepseek: {
    id: "deepseek/deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    input: 0.3,
    output: 1.2,
  },
  sonnet: {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    input: 2,
    output: 10,
  },
  // Long-context maximum rates; protect against >272K input surcharges.
  sol: { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", input: 4, output: 15 },
  "glm-advanced": {
    id: "z-ai/glm-5.3",
    label: "GLM 5.3 [1M]",
    input: 1.4,
    output: 4.4,
  },
} as const;
export const modelLabel = (id: string) =>
  Object.values(MODELS).find((model) => model.id === id)?.label ||
  (id === "qwen/qwen3-coder-30b-a3b-instruct"
    ? "Qwen3 Coder 30B A3B Instruct"
    : id === "qwen/qwen3-coder"
      ? "Qwen3 Coder 480B A35B"
      : id);

export const choiceForModel = (id: unknown): ModelChoice | undefined =>
  Object.entries(MODELS).find(([, model]) => model.id === id)?.[0] as
    | ModelChoice
    | undefined;

export const modelTier = (choice: ModelChoice): ModelTier =>
  ["sonnet", "sol", "glm-advanced"].includes(choice) ? "advanced" : "basic";
