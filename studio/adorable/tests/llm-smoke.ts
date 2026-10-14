import {safeProgressStream} from '../lib/safe-progress-stream';
import {ensureFinalResponse,withFinalText} from '../lib/final-response';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { tool } from 'ai';
import { z } from 'zod';
import { streamLlmResponse } from '../lib/llm-provider';

// Deterministic provider smoke test: tools continue until the harness explicitly
// reserves its final step for text. No remote model calls or credentials needed.
async function main() {
let calls: Record<string, unknown>[] = [];
let emptyFinal=false;
let crashFinal=false;
const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const body = JSON.parse(Buffer.concat(chunks).toString());
  calls.push(body);
  const answer = body.tool_choice === 'none';
  if(crashFinal && answer){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Simulated provider failure'}}));return;}
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const envelope = (delta: unknown, finish_reason: string | null) => ({
    id: `smoke-${calls.length}`, object: 'chat.completion.chunk', created: 1, model: 'smoke',
    choices: [{ index: 0, delta, finish_reason }],
  });
  res.write(`data: ${JSON.stringify(envelope(answer
    ? { role: 'assistant', content: emptyFinal?'':'SMOKE_FINAL_ANSWER' }
    : { role: 'assistant', tool_calls: [{ index: 0, id: `call-${calls.length}`, type: 'function', function: { name: 'inspect', arguments: '{}' } }] }, null))}\n\n`);
  res.write(`data: ${JSON.stringify({ ...envelope({}, answer ? 'stop' : 'tool_calls'), usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
assert(address && typeof address !== 'string');
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${address.port}/v1`;
process.env.LLM_MODEL = 'smoke';
try {
  for (const maxSteps of [7, 5]) {
    calls = [];
    let executions = 0, reservations = 0, settlements = 0;
    const { result } = await streamLlmResponse({
      system: 'Use tools until told to answer.', apiKey: 'local-smoke-only', maxSteps,
      messages: [{ id: 'smoke', role: 'user', parts: [{ type: 'text', text: 'Inspect then summarize.' }] }],
      tools: { inspect: tool({ inputSchema: z.object({}), execute: async () => { executions++; return { ok: true }; } }) },
      beforeStep: async () => { reservations++; },
      afterStep: async () => { settlements++; },
    });
    const errors: unknown[] = [];
    for await (const event of result.fullStream) if (event.type === 'error') errors.push(event.error);
    assert.deepEqual(errors, []);
    assert.equal(await result.text, 'SMOKE_FINAL_ANSWER');
    assert.equal(calls.length, maxSteps);
    assert.equal(executions, maxSteps - 1);
    assert.equal(calls.at(-1)?.tool_choice, 'none');
    assert.equal(reservations, maxSteps);
    assert.equal(settlements, maxSteps);
    console.log(`PASS ${maxSteps} steps: tool results followed by visible answer; accounting hooks preserved`);
  }
  emptyFinal=true;
  const {result}=await streamLlmResponse({system:'Inspect then answer.',apiKey:'local-test',maxSteps:2,messages:[{id:'empty',role:'user',parts:[{type:'text',text:'Inspect then answer.'}]}],tools:{inspect:tool({inputSchema:z.object({}),execute:async()=>({ok:true})})}});
  let fallback:string|null=null;let saved:any[]=[];
  const stream=result.toUIMessageStream({onFinish:({messages})=>{const completion=ensureFinalResponse(messages);fallback=completion.text;saved=completion.messages;}});
  const events:any[]=[];const finalReader=withFinalText(stream,()=>fallback).getReader();while(true){const item=await finalReader.read();if(item.done)break;events.push(item.value);}
  assert.ok(saved.at(-1).parts.some((part:any)=>part.type==='text'&&part.text.includes('Harness status')));
  assert.ok(events.some(event=>event.type==='text-delta'&&event.delta.includes('Harness status')));
  assert.equal(events.at(-1).type,'finish');
  console.log('PASS empty provider completion receives a visible and persisted harness status');
  emptyFinal=false;crashFinal=true;let interrupted=false;fallback=null;saved=[];
  const failed=await streamLlmResponse({system:'Inspect then answer.',apiKey:'local-test',maxSteps:2,messages:[{id:'failure',role:'user',parts:[{type:'text',text:'Inspect then answer.'}]}],tools:{inspect:tool({inputSchema:z.object({}),execute:async()=>({ok:true})})}});
  const failedStream=failed.result.toUIMessageStream({onError:()=>{interrupted=true;return 'Provider failed';},onFinish:({messages,isAborted})=>{const completion=ensureFinalResponse(messages,interrupted||isAborted);fallback=completion.text;saved=completion.messages;}});
  const failureReader=safeProgressStream(withFinalText(failedStream,()=>fallback),async()=>{},v=>v).getReader();const failureEvents:any[]=[];
  while(true){const item=await failureReader.read();if(item.done)break;failureEvents.push(item.value);}
  assert.ok(saved.at(-1).parts.some((p:any)=>p.type==='tool-inspect'&&p.state==='output-available'),'Completed tool result must survive provider failure');
  assert.ok(failureEvents.some(e=>e.type==='text-delta'&&e.delta.includes('interrupted')),'Interruption status must reach the browser');
  assert.ok(failureEvents.some(e=>e.type==='error'));
  console.log('PASS later provider failure preserves completed tools and streams an interruption status');

} finally {
  server.closeAllConnections();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
}
main().catch(error => { console.error(error); process.exitCode = 1; });
