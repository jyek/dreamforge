import assert from 'node:assert/strict';import {createServer} from 'node:http';import {tool} from 'ai';import {z} from 'zod';import {streamLlmResponse} from '../lib/llm-provider';
async function main(){
 const calls:any[]=[];let freeCalls=0,executions=0;
 const server=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const part of req)chunks.push(Buffer.from(part));const body=JSON.parse(Buffer.concat(chunks).toString());calls.push(body);
  const free=body.model==='cohere/north-mini-code:free';if(free && ++freeCalls===2){res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Rate limit exceeded: free-models-per-day',code:429}}));return;}
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const packet=(delta:any,reason:string|null)=>({id:'test',object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason:reason}]});
  res.write('data: '+JSON.stringify(packet(free?{role:'assistant',tool_calls:[{index:0,id:'inspect',type:'function',function:{name:'inspect',arguments:'{}'}}]}:{role:'assistant',content:'QWEN_FALLBACK_OK'},null))+'\n\n');
  res.write('data: '+JSON.stringify({...packet({},free?'tool_calls':'stop'),usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}})+'\n\n');res.end('data: [DONE]\n\n');
 });await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');
 process.env.OPENAI_BASE_URL=`http://127.0.0.1:${address.port}/v1`;process.env.LLM_MODEL='cohere/north-mini-code:free';
 try{const {result}=await streamLlmResponse({apiKey:'test-only',system:'Read then answer.',messages:[{id:'test',role:'user',parts:[{type:'text',text:'Read then answer.'}]}],tools:{inspect:tool({inputSchema:z.object({}),execute:async()=>{executions++;return {ok:true};}})}});
  const errors=[];for await(const part of result.fullStream)if(part.type==='error')errors.push(part.error);assert.deepEqual(errors,[]);assert.equal(await result.text,'QWEN_FALLBACK_OK');assert.equal(executions,1);assert.equal(calls.at(-1).model,'qwen/qwen3-coder');assert.ok(calls.at(-1).messages.some((m:any)=>m.role==='tool'));console.log('PASS quota fallback preserves completed tool results and ends in text');
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
}main().catch(error=>{console.error(error);process.exitCode=1;});
