import {test} from 'node:test';import assert from 'node:assert/strict';import {withQuotaFallback,isQuotaError} from '../lib/quota-fallback';
const model=(run:any)=>({specificationVersion:'v3',provider:'test',modelId:'test',supportedUrls:{},doStream:run}) as any;
const response=(parts:any[])=>({stream:new ReadableStream({start(c){parts.forEach(p=>c.enqueue(p));c.close();}})});
const options={prompt:[]} as any;
async function parts(result:any){const reader=result.stream.getReader();const values=[];for(;;){const item=await reader.read();if(item.done)return values;values.push(item.value);}}
test('429 activates fallback once and keeps later steps on fallback',async()=>{
 let primary=0,fallback=0;const routed=withQuotaFallback(model(async()=>{primary++;throw {statusCode:429};}),model(async()=>{fallback++;return response([{type:'text-delta',delta:'QWEN'}]);}));
 assert.equal((await parts(await routed.doStream(options)))[0].delta,'QWEN');await parts(await routed.doStream(options));assert.equal(primary,1);assert.equal(fallback,2);
});
test('mid-stream quota drops partial tool calls before retry, preventing duplicate tool execution',async()=>{
 const routed=withQuotaFallback(model(async()=>response([{type:'tool-call',toolName:'write',toolCallId:'partial'},{type:'error',error:{code:429}}])),model(async()=>response([{type:'tool-call',toolName:'read',toolCallId:'fallback'}])));
 assert.deepEqual((await parts(await routed.doStream(options))).map(p=>p.toolCallId),['fallback']);
});
test('successful free calls and non-quota failures do not spend on fallback',async()=>{
 let fallback=0;const paid=model(async()=>{fallback++;return response([]);});await parts(await withQuotaFallback(model(async()=>response([])),paid).doStream(options));
 for(const statusCode of [401,402,500])await assert.rejects(()=>withQuotaFallback(model(async()=>{throw {statusCode};}),paid).doStream(options));assert.equal(fallback,0);assert.equal(isQuotaError({statusCode:402}),false);
});
