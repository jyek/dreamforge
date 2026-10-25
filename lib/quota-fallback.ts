import type {createOpenAI} from '@ai-sdk/openai';
type ChatModel=ReturnType<ReturnType<typeof createOpenAI>['chat']>;
export function isQuotaError(error:unknown):boolean {
 if(!error || typeof error!=='object')return false;
 const item=error as {statusCode?:unknown;code?:unknown;message?:unknown;lastError?:unknown;cause?:unknown};
 if(item.statusCode===401 || item.statusCode===402 || item.code===401 || item.code===402)return false;
 return item.statusCode===429 || item.code===429 || item.code==='429' ||
  (typeof item.message==='string' && /(?:free.model.{0,40}(?:quota|limit)|rate.limit exceeded|daily quota exceeded)/i.test(item.message)) ||
  Boolean(item.lastError && isQuotaError(item.lastError)) || Boolean(item.cause && isQuotaError(item.cause));
}
/** Buffer a single provider call before handing events to the agent. This lets
 * a mid-stream 429 retry the same step without executing partial tool calls.
 * Completed earlier steps are never replayed. Switch back on the next request. */
export function withQuotaFallback(primary:ChatModel,fallback:ChatModel):ChatModel {
 let fallbackActive=false;
 return new Proxy(primary,{
  get(target,key){
   if(key==='doStream')return async(options:Parameters<ChatModel['doStream']>[0])=>{
    const run=async(model:ChatModel)=>{
     const result=await model.doStream(options);const reader=result.stream.getReader();
     const chunks:unknown[]=[];let bytes=0;
     try {
      while(true){const item=await reader.read();if(item.done)break;
       if(item.value.type==='error' && isQuotaError(item.value.error))throw item.value.error;
       chunks.push(item.value);bytes+=JSON.stringify(item.value).length;
       if(bytes>2_000_000)throw new Error('Model step is too large.');
      }
     } catch(error){await reader.cancel().catch(()=>{});throw error;} finally{reader.releaseLock();}
     return {...result,stream:new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}})};
    };
    try{return await run(fallbackActive?fallback:primary);}catch(error){
     if(fallbackActive || options.abortSignal?.aborted || !isQuotaError(error))throw error;
     fallbackActive=true;return run(fallback);
    }
   };
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }
 });
}
