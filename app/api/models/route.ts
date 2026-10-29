import { modelOptions, QUOTA_FALLBACK_MODEL } from "@/lib/allowed-models";
import {
  MODEL_CHOICES,
  modelTier,
  DEFAULT_MODEL_CHOICE,
} from "@/lib/model-catalog";
export async function GET() {
  const models = modelOptions();
  return Response.json(
    {
      models,
      prepaid: true,

      choices: MODEL_CHOICES.map((choice) => ({
        id: choice.id,
        name: choice.label,
        tier: modelTier(choice.id),
        available: true,
        paid: true,
      })),
      defaultModel: models[0].id,
      defaultChoice: DEFAULT_MODEL_CHOICE,
      quotaFallbackModel: QUOTA_FALLBACK_MODEL,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
