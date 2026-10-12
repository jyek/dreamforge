import {modelOptions,QUOTA_FALLBACK_MODEL} from '@/lib/allowed-models';
export function GET(){const models=modelOptions();return Response.json({models,defaultModel:models[0].id,quotaFallbackModel:QUOTA_FALLBACK_MODEL},{headers:{'Cache-Control':'no-store'}});}
