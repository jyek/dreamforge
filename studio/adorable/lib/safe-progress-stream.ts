/** Only screened completed text/tool values reach the user. Raw arguments and
 * reasoning never stream. Status messages are fixed labels, not model thoughts. */
export function safeProgressStream(source:ReadableStream<unknown>,screen:(text:string)=>Promise<unknown>,redact:(value:unknown)=>unknown){
 let reader:ReadableStreamDefaultReader<unknown>;let cancelled=false;
 return new ReadableStream<unknown>({
  async start(controller){
   const status=(message:string)=>{if(!cancelled)controller.enqueue({type:'data-progress',data:{message},transient:true});};
   status('Getting ready…');
   const timer=setInterval(()=>status('Still working on your request…'),8000);
   reader=source.getReader();let text='';let textId='';let completeText='';let bytes=0;
   try {
    while(true){const item=await reader.read();if(item.done)break;const chunk=item.value as any;bytes+=JSON.stringify(chunk).length;if(bytes>500000)throw new Error('Response too large');
     if(chunk.type==='error'||chunk.type==='abort')throw new Error('Agent stream interrupted');
     if(chunk.type==='text-start'){text='';textId=chunk.id;continue;}
     if(chunk.type==='text-delta'){text+=chunk.delta;continue;}
     if(chunk.type==='text-end'){
      const safe=redact(text) as string;await screen(completeText+'\n'+safe);completeText+='\n'+safe;
      if(safe.trim()){controller.enqueue({type:'text-start',id:textId});controller.enqueue({type:'text-delta',id:textId,delta:safe});controller.enqueue({type:'text-end',id:textId});}continue;
     }
     if(chunk.type==='tool-input-start'){
      const labels:Record<string,string>={readFileTool:'Reading project files…',listFilesTool:'Looking through the project…',writeFileTool:'Preparing a file update…',checkAppTool:'Checking the app…'};status(labels[chunk.toolName]||'Working on the project…');continue;
     }
     if(chunk.type==='tool-input-delta'||chunk.type.startsWith('reasoning'))continue;
     if(chunk.type==='tool-input-available'||chunk.type==='tool-output-available'||chunk.type==='tool-output-error'){
      const safe=redact(chunk);await screen(JSON.stringify(safe));controller.enqueue(safe);continue;
     }
     if(chunk.type==='finish')status('');
     controller.enqueue(chunk);
    }
   }catch(error){if(!cancelled){status('');controller.enqueue({type:'error',errorText:'This request could not finish. Please try again.'});}}
   finally{clearInterval(timer);await reader.cancel().catch(()=>{});reader.releaseLock();if(!cancelled)controller.close();}
  },cancel(){cancelled=true;return reader?.cancel();}
 });
}
