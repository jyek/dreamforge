import { MODELS } from "./model-catalog";
export const DEFAULT_CODING_MODEL = MODELS.glm.id;
export const QUOTA_FALLBACK_MODEL = MODELS.glm.id;
export const EXTRA_MODELS = Object.entries(MODELS)
  .filter(([key]) => key !== "free")
  .map(([, model]) => ({ id: model.id, name: model.label, paid: true }));
export function modelOptions() {
  return [MODELS.glm, MODELS.free, MODELS.deepseek].map((model) => ({
    id: model.id,
    name: model.label,
    paid: model !== MODELS.free,
  }));
}
export function resolveModel(requested: unknown) {
  if (requested === undefined || requested === null)
    return DEFAULT_CODING_MODEL;
  if (
    typeof requested !== "string" ||
    !modelOptions().some((model) => model.id === requested)
  )
    throw Error("Choose an available coding model.");
  return requested;
}
