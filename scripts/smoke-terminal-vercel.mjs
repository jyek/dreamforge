import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.argv[2];const {id}=JSON.parse(await fs.readFile('.deployment/vercel-smoke-project.json'));
const session=`verification-${crypto.randomUUID().slice(0,8)}`;
const marker=`TERMINAL_${Date.now()}`;
const endpoint=`${origin}/api/projects/${id}/terminal`;
const input=await fetch(endpoint,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({session,data:`printf 'TERMINAL_%s\\n' '${marker.slice(9)}'\r`}),signal:AbortSignal.timeout(20000)});
assert.equal(input.status,200);console.log('PASS terminal input POST');
const output=await fetch(`${endpoint}?session=${session}`,{signal:AbortSignal.timeout(25000)});assert.equal(output.status,200);
const reader=output.body.getReader();let buffer='',text='';
try{
 while(!text.includes(marker)){
  const chunk=await reader.read();if(chunk.done)break;
  buffer+=new TextDecoder().decode(chunk.value);const packets=buffer.split('\n\n');buffer=packets.pop();
  for(const packet of packets)for(const line of packet.split('\n'))if(line.startsWith('data: '))text+=Buffer.from(line.slice(6),'base64').toString();
 }
 assert(text.includes(marker),text);console.log('PASS terminal replay contains real command output');
}finally{await reader.cancel();}
console.log('PASS terminal stream cancellation');
