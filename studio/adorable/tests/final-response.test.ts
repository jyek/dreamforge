import {test} from 'node:test';import assert from 'node:assert/strict';import {ensureFinalResponse,withFinalText} from '../lib/final-response';
test('empty final response gets evidence-based status without claiming visual success',()=>{
 const result=ensureFinalResponse([{id:'a',role:'assistant',parts:[{type:'text',text:''},{type:'tool-writeFileTool',state:'output-available',output:{ok:true,file:'app/game.tsx'}},{type:'tool-checkAppTool',state:'output-available',output:{ok:true}}]}] as any);
 assert.match(result.text!,/app\/game.tsx/);assert.match(result.text!,/appearance still need checking/);assert.match(result.text!,/Harness status/);
 assert.equal(ensureFinalResponse(result.messages).text,null);
});
test('ordinary text is preserved and tool failures do not become success',()=>{
 assert.equal(ensureFinalResponse([{id:'a',role:'assistant',parts:[{type:'text',text:'Done'}]}]).text,null);
 assert.match(ensureFinalResponse([{id:'a',role:'assistant',parts:[{type:'tool-writeFileTool',state:'output-error'}]}] as any).text!,/may be incomplete/);
});
test('fallback text is inserted before finish in the streamed response',async()=>{
 const source=new ReadableStream({start(c){c.enqueue({type:'start'});c.enqueue({type:'finish'});c.close();}});const parts=[];const reader=withFinalText(source,()=> 'Harness status').getReader();while(true){const item=await reader.read();if(item.done)break;parts.push(item.value);}assert.deepEqual(parts.map(p=>p.type),['start','text-start','text-delta','text-end','finish']);
});
test('preliminary narration followed by empty final step gets an incomplete status',()=>{
 const result=ensureFinalResponse([{id:'a',role:'assistant',parts:[{type:'step-start'},{type:'text',text:"I'll read the project first."},{type:'tool-readFileTool',state:'output-available',output:{content:'source'}},{type:'step-start'},{type:'text',text:''}]}] as any);
 assert.match(result.text!,/Completion was not confirmed/);
 assert.equal(ensureFinalResponse(result.messages).text,null);
});
