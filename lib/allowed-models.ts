import { MODELS, DEFAULT_MODEL_CHOICE } from "./model-catalog";
export const DEFAULT_CODING_MODEL = MODELS[DEFAULT_MODEL_CHOICE].id;
export const QUOTA_FALLBACK_MODEL = DEFAULT_CODING_MODEL;
export const EXTRA_MODELS = Object.values(MODELS).map((m) => ({
  id: m.id,
  name: m.label,
  paid: true,
}));
export const modelOptions = () => EXTRA_MODELS;
export function resolveModel(requested: unknown) {
  if (requested == null) return DEFAULT_CODING_MODEL;
  if (
    typeof requested !== "string" ||
    !modelOptions().some((m) => m.id === requested)
  )
    throw Error("Choose an available coding model.");
  return requested;
}
