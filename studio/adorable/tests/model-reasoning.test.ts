import {test} from 'node:test';import assert from 'node:assert/strict';import {createModelRouting} from '../lib/model-routing';
test('DeepSeek disables optional thinking; GLM keeps mandatory reasoning at low effort',async()=>{
 for(const choice of ['deepseek','glm'] as const){let body:any;const router=createModelRouting(choice,'test',{request:async(_input,init)=>{body=JSON.parse(init!.body as string);return new Response('{}',{status:200});}});await router.fetch('https://example.test',{body:JSON.stringify({messages:[],reasoning_effort:'low',max_tokens:8192})});assert.equal(body.reasoning_effort,undefined);assert.deepEqual(body.reasoning,choice==='deepseek'?{enabled:false,exclude:true}:{effort:'low',exclude:true});assert.ok(body.provider.require_parameters);}
});
