import {test} from 'node:test';import assert from 'node:assert/strict';import {safeProgressStream} from '../lib/safe-progress-stream';
test('status streams immediately and text waits for screening without waiting for whole run',async()=>{
 let input!:ReadableStreamDefaultController<unknown>;let screenDone!:()=>void;
 const source=new ReadableStream<any>({start(c){input=c;}});const screened=new Promise<void>(resolve=>screenDone=resolve);
 const reader=safeProgressStream(source,()=>screened,value=>value).getReader() as ReadableStreamDefaultReader<any>;assert.equal((await reader.read()).value.type,'data-progress');
 input.enqueue({type:'start'});assert.equal((await reader.read()).value.type,'start');
 input.enqueue({type:'text-start',id:'a'});input.enqueue({type:'text-delta',id:'a',delta:'Safe progress'});input.enqueue({type:'text-end',id:'a'});
 let delivered=false;const next=reader.read().then(item=>{delivered=true;return item;});await new Promise(resolve=>setTimeout(resolve,10));assert.equal(delivered,false);screenDone();assert.equal((await next).value.type,'text-start');assert.equal((await reader.read()).value.delta,'Safe progress');assert.equal((await reader.read()).value.type,'text-end');
 input.enqueue({type:'finish'});input.close();while(!(await reader.read()).done){}
});
test('unsafe text, raw tool arguments and reasoning never reach the user',async()=>{
 const source=new ReadableStream({start(c){for(const part of [{type:'reasoning-delta',delta:'private'},{type:'tool-input-delta',inputTextDelta:'secret'},{type:'text-start',id:'a'},{type:'text-delta',id:'a',delta:'blocked'},{type:'text-end',id:'a'}])c.enqueue(part);c.close();}});
 const reader=safeProgressStream(source,async()=>{throw Error('blocked');},v=>v).getReader();const chunks=[];while(true){const item=await reader.read();if(item.done)break;chunks.push(item.value);}assert.ok(chunks.some((c:any)=>c.type==='error'));assert.ok(!JSON.stringify(chunks).includes('private'));assert.ok(!chunks.some((c:any)=>c.type==='text-delta'));
});
