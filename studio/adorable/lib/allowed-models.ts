import { MODELS } from "./model-catalog";
export const DEFAULT_CODING_MODEL = MODELS.free.id;
export const QUOTA_FALLBACK_MODEL = MODELS.glm.id;
export const EXTRA_MODELS = Object.entries(MODELS)
  .filter(([key]) => key !== "free")
  .map(([, model]) => ({ id: model.id, name: model.label, paid: true }));
export function modelOptions() {
  return [
    { id: DEFAULT_CODING_MODEL, name: "North Mini Code (free)", paid: false },
    ...EXTRA_MODELS,
  ];
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
