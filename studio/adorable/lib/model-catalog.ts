export const MODEL_CHOICES = [
  { id: "auto", label: "Auto" },
  { id: "free", label: "Cohere North Mini Code" },
  { id: "qwen", label: "Qwen3 Coder 30B A3B Instruct" },
  { id: "glm", label: "GLM 5.3 Flash" },
  { id: "deepseek", label: "DeepSeek V4.1 Flash" },
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
  qwen: {
    id: "qwen/qwen3-coder-30b-a3b-instruct",
    label: "Qwen3 Coder 30B A3B Instruct",
    input: 0.07,
    output: 0.28,
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
} as const;
export const modelLabel = (id: string) =>
  Object.values(MODELS).find((model) => model.id === id)?.label ||
  (id === "qwen/qwen3-coder" ? "Qwen3 Coder 480B A35B" : id);

export const choiceForModel = (id: unknown): ModelChoice | undefined =>
  Object.entries(MODELS).find(([, model]) => model.id === id)?.[0] as
    | ModelChoice
    | undefined;
