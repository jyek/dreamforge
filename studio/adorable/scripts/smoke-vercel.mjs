import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.argv[2];
if(!origin?.startsWith('https://'))throw Error('Pass the Vercel origin');
const check=async(path,init={},status=200)=>{
 const response=await fetch(origin+path,{...init,signal:AbortSignal.timeout(90000)});
 assert.equal(response.status,status,`${path}: ${await response.clone().text().then(s=>s.slice(0,200))}`);
 return response;
};
const mutation=body=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
assert.equal((await check('/')).headers.get('content-type').includes('text/html'),true);
assert.equal((await (await check('/api/session')).json()).demo,true);
const {projects}=await (await check('/api/projects')).json();assert(projects.length>=4);
for(const project of projects){for(const conversation of project.conversations){const history=await (await check(`/api/projects/${project.id}/conversations/${conversation.id}`)).json();assert(Array.isArray(history.messages));}}
console.log('PASS direct UI, shared demo, four migrated projects and seven chat histories');
await check('/api/chat',{...mutation({}),headers:{...mutation({}).headers,Origin:'https://untrusted.example'}},403);
await check('/api/chat',mutation({}),400);
await check('/api/cron/runtime',{},401);
const {cronSecret}=JSON.parse(await fs.readFile('.deployment/vercel-environment.json'));
await check('/api/cron/runtime',{headers:{Authorization:`Bearer ${cronSecret}`}});
console.log('PASS origin validation, chat validation and protected runtime maintenance');
const prior=await fs.readFile('.deployment/vercel-smoke-project.json','utf8').then(JSON.parse).catch(()=>null);
const created=prior && projects.some(p=>p.id===prior.id) ? prior : await (await check('/api/projects',mutation({name:'Vercel migration verification'}))).json();
await fs.writeFile('.deployment/vercel-smoke-project.json',JSON.stringify(created),{mode:0o600});
assert(created.id&&created.conversationId);
const messages=[{id:crypto.randomUUID(),role:'user',parts:[{type:'text',text:'Reply with exactly VERCEL_SUPABASE_OK. Do not call tools or edit files.'}]}];
const response=await check('/api/chat',mutation({projectId:created.id,conversationId:created.conversationId,messages}));
const output=await response.text();const answer=output.split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6))).filter(event=>event.type==='text-delta').map(event=>event.delta).join('');assert(answer.includes('VERCEL_SUPABASE_OK'),output.slice(-500));
const history=await (await check(`/api/projects/${created.id}/conversations/${created.conversationId}`)).json();
assert(history.messages.some(message=>message.role==='assistant'&&message.parts.some(p=>p.type==='text'&&p.text.includes('VERCEL_SUPABASE_OK'))));
console.log('PASS project creation, streamed real AI response and persisted Supabase chat');
const files=await (await check(`/api/projects/${created.id}/files`)).json();assert(files.files.includes('app/page.tsx'));
await check(`/api/projects/${created.id}/files?file=.env`,{},400);
console.log('PASS source access; checking terminal input and replay');
const terminal=await check(`/api/projects/${created.id}/terminal?session=verification`);
let reader=terminal.body.getReader();assert(!(await reader.read()).done);
await check(`/api/projects/${created.id}/terminal`,mutation({session:'verification',data:"printf 'TERMINAL_%s\\n' 'VERCEL_OK'\r"}));
console.log('PASS terminal input request');
await reader.cancel();
const reconnected=await check(`/api/projects/${created.id}/terminal?session=verification`);
reader=reconnected.body.getReader();
let terminalOutput='',terminalBuffer='';
for(let index=0;index<30;index++){
 const chunk=await reader.read();if(chunk.done)break;
 terminalBuffer+=new TextDecoder().decode(chunk.value);
 const packets=terminalBuffer.split('\n\n');terminalBuffer=packets.pop();
 for(const packet of packets)for(const line of packet.split('\n'))if(line.startsWith('data: '))terminalOutput+=Buffer.from(line.slice(6),'base64').toString();
 if(terminalOutput.includes('TERMINAL_VERCEL_OK'))break;
}
await reader.cancel();assert(terminalOutput.includes('TERMINAL_VERCEL_OK'),terminalOutput);
console.log('PASS project files, private-file exclusion and terminal stream');
const preview=await fetch(created.project.previewUrl,{signal:AbortSignal.timeout(20000)});assert.equal(preview.status,200);
console.log('PASS live Freestyle preview from the Vercel app');
const publish=await (await check(`/api/projects/${created.id}/publish`,mutation({message:'Vercel smoke verification'}))).json();
for(let attempt=0;attempt<60;attempt++){
 const list=await (await check('/api/projects')).json();const project=list.projects.find(p=>p.id===created.id);const release=project.releases.find(r=>r.id===publish.releaseId);
 if(release.state==='failed')throw Error(release.error);
 if(release.state==='live'){
  const published=await fetch(project.productionUrl,{signal:AbortSignal.timeout(20000)});assert.equal(published.status,200);
  console.log('PASS background publishing completed after the Vercel request returned');break;
 }
 if(attempt===59)throw Error('Publishing did not complete');
 await new Promise(resolve=>setTimeout(resolve,5000));
}
