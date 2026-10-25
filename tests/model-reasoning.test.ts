import {test} from 'node:test';import assert from 'node:assert/strict';import {createModelRouting} from '../lib/model-routing';
test('DeepSeek disables optional thinking; GLM keeps mandatory reasoning at low effort',async()=>{
 for(const choice of ['deepseek','glm'] as const){let body:any;const router=createModelRouting(choice,'test',{request:async(_input,init)=>{body=JSON.parse(init!.body as string);return new Response('{}',{status:200});}});await router.fetch('https://example.test',{body:JSON.stringify({messages:[],reasoning_effort:'low',max_tokens:8192})});assert.equal(body.reasoning_effort,undefined);assert.deepEqual(body.reasoning,choice==='deepseek'?{enabled:false,exclude:true}:{effort:'low',exclude:true});assert.ok(body.provider.require_parameters);}
});
test('Auto uses GLM only after confirmed free quota exhaustion',async()=>{
 for(const remaining of [1,0]){
  let body:any;
  const router=createModelRouting('auto','test',{quota:async()=>({remaining}),request:async(_input,init)=>{body=JSON.parse(init!.body as string);return new Response('{}',{status:200});}});
  await router.fetch('https://example.test',{body:JSON.stringify({messages:[]})});
  assert.equal(body.model,remaining?'cohere/north-mini-code:free':'z-ai/glm-5.3-flash');
  if(!remaining){assert.equal(body.provider.sort,'throughput');assert.equal(body.provider.max_price.completion,0.5);}
 }
});
