import { modelOptions, QUOTA_FALLBACK_MODEL } from "@/lib/allowed-models";
import { MODEL_CHOICES, MODELS } from "@/lib/model-catalog";
import { freeQuota } from "@/lib/model-routing";
export async function GET() {
  const quota = await freeQuota().catch(() => null);
  const autoModel = quota
    ? quota.remaining > 0
      ? MODELS.free.id
      : MODELS.glm.id
    : null;
  const models = modelOptions();
  return Response.json(
    {
      models,
      autoModel,
      choices: MODEL_CHOICES.map((choice) => ({
        id: choice.id,
        name: choice.label,
        paid: choice.id !== "auto" && choice.id !== "free",
      })),
      defaultModel: models[0].id,
      defaultChoice: "auto",
      quotaFallbackModel: QUOTA_FALLBACK_MODEL,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
