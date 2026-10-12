export const DEFAULT_CODING_MODEL='cohere/north-mini-code:free';
export const QUOTA_FALLBACK_MODEL='qwen/qwen3-coder';
export const EXTRA_MODELS = [
 {id:QUOTA_FALLBACK_MODEL,name:'Qwen3-Coder',paid:true},
 {id:'deepseek/deepseek-v4.1-flash',name:'DeepSeek V4.1 Flash',paid:true},
 {id:'z-ai/glm-5.3-flash',name:'GLM 5.3 Flash',paid:true},
] as const;
export function modelOptions(){
 const id=process.env.LLM_MODEL || DEFAULT_CODING_MODEL;
 return [{id,name:EXTRA_MODELS.find(model=>model.id===id)?.name || (id==='cohere/north-mini-code:free'?'North Mini Code (free)':id),paid:!id.endsWith(':free')},...EXTRA_MODELS.filter(model=>model.id!==id)];
}
export function resolveModel(requested:unknown){
 const options=modelOptions();if(requested===undefined||requested===null)return options[0].id;
 if(typeof requested!=='string'||!options.some(model=>model.id===requested))throw new Error('Choose an available coding model.');
 return requested;
}
