import type {UIMessage} from 'ai';
/** A visible harness status, not a fabricated model answer or proof of completion. */
export function ensureFinalResponse(messages:UIMessage[], interrupted=false){
 const last=messages.at(-1);
 if(!last || last.role!=='assistant')return {messages,text:null};
 // Preliminary narration is not a final answer. Only text in the final step
 // after its tool results counts as a written summary.
 const boundary=Math.max(last.parts.findLastIndex(part=>part.type==='step-start'),last.parts.findLastIndex(part=>part.type.startsWith('tool-')));
 if(!interrupted && last.parts.slice(boundary+1).some(part=>part.type==='text'&&part.text.trim()))return {messages,text:null};
 const tools=last.parts.filter(part=>part.type.startsWith('tool-')) as unknown as {type:string;state?:string;input?:{file?:string};output?:{ok?:boolean;file?:string;statusCode?:string|number}}[];
 const written=tools.filter(part=>part.type==='tool-writeFileTool'&&part.state==='output-available'&&part.output?.ok===true).map(part=>part.output?.file||part.input?.file).filter((file):file is string=>Boolean(file));
 const healthy=tools.some(part=>part.type==='tool-checkAppTool'&&part.state==='output-available'&&part.output?.ok===true);
 const failed=tools.some(part=>part.state==='output-error'||part.output?.ok===false);
 let text=interrupted?'**Harness status:** This run was interrupted before a final summary. The request may be incomplete.':'**Harness status:** The agent ended without a written summary.';
 if(written.length)text+=' Updated '+[...new Set(written)].slice(0,4).map(file=>'`'+file.replace(/[`\n\r]/g,'')+'`').join(', ')+'.';
 if(healthy)text+=' The app passed a basic availability check; gameplay and appearance still need checking.';
 if(failed)text+=' Some tool steps failed, so the request may be incomplete.';
 if(!written.length&&!healthy&&!failed)text+=' Completion was not confirmed. Please try again.';
 return {messages:[...messages.slice(0,-1),{...last,parts:[...last.parts,{type:'text' as const,text}]}],text};
}
export function withFinalText<T>(stream:ReadableStream<T>,getText:()=>string|null):ReadableStream<T>{
 let finish:T|undefined;
 return stream.pipeThrough(new TransformStream<T,T>({
  transform(chunk,controller){if((chunk as {type?:string}).type==='finish')finish=chunk;else controller.enqueue(chunk);},
  flush(controller){const text=getText();if(text){const id='harness-final-status';for(const chunk of [{type:'text-start',id},{type:'text-delta',id,delta:text},{type:'text-end',id}])controller.enqueue(chunk as T);}if(finish)controller.enqueue(finish);}
 }));
}
export function uiStreamResponse(stream:ReadableStream<unknown>){
 return new Response(stream.pipeThrough(new TransformStream({transform(chunk,controller){controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));},flush(controller){controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));}})),{headers:{'Content-Type':'text/event-stream','x-vercel-ai-ui-message-stream':'v1','Cache-Control':'no-store'}});
}
