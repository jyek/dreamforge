export type ModelTier = "basic" | "advanced";
export const MODEL_CHOICES = [
  { id: "haiku", label: "Claude Haiku 5.5" },
  { id: "sonnet", label: "Claude Sonnet 5.5" },
  { id: "luna", label: "GPT-6 Luna" },
  { id: "sol", label: "GPT-6.1 Sol" },
  { id: "gemini-lite", label: "Gemini 3.5 Flash-Lite" },
  { id: "gemini", label: "Gemini 3.8 Flash" },
  { id: "glm", label: "GLM 5.3 Flash" },
] as const;
export type ModelChoice = (typeof MODEL_CHOICES)[number]["id"];
export const DEFAULT_MODEL_CHOICE: ModelChoice = "haiku";
export const isModelChoice = (value: unknown): value is ModelChoice =>
  MODEL_CHOICES.some((c) => c.id === value);
// Supplier maximum USD rates per 1M tokens, including long-context tiers.
export const MODELS = {
  haiku: {
    id: "anthropic/claude-haiku-5.5",
    label: "Claude Haiku 5.5",
    input: 0.5,
    output: 2.5,
  },
  sonnet: {
    id: "anthropic/claude-sonnet-5.5",
    label: "Claude Sonnet 5.5",
    input: 2,
    output: 10,
  },
  luna: {
    id: "openai/gpt-6-luna",
    label: "GPT-6 Luna",
    input: 0.2,
    output: 0.75,
  },
  sol: { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", input: 4, output: 15 },
  "gemini-lite": {
    id: "google/gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    input: 0.3,
    output: 2.5,
  },
  gemini: {
    id: "google/gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    input: 0.825,
    output: 4.125,
  },
  glm: {
    id: "z-ai/glm-5.3-flash",
    label: "GLM 5.3 Flash",
    input: 0.15,
    output: 0.5,
  },
} as const;
export const modelTier = (choice: ModelChoice): ModelTier =>
  ["sonnet", "sol", "gemini"].includes(choice) ? "advanced" : "basic";
export const modelLabel = (id: string) =>
  Object.values(MODELS).find((m) => m.id === id)?.label || id;
export const choiceForModel = (id: unknown): ModelChoice | undefined =>
  Object.entries(MODELS).find(([, m]) => m.id === id)?.[0] as
    | ModelChoice
    | undefined;
