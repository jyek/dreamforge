import { APPLICATION_DATABASE_OPTIONS } from "../lib/database-options.mjs";
import fs from 'node:fs/promises';import dotenv from 'dotenv';import {Pool} from 'pg';import {randomUUID} from 'node:crypto';import assert from 'node:assert/strict';
const env=dotenv.parse(await fs.readFile('.env'));const uri=new URL(env.DATABASE_URL);uri.port='6543';for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])uri.searchParams.delete(key);
const db=new Pool({options: APPLICATION_DATABASE_OPTIONS,connectionString:uri.toString(),ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},max:1});const base='https://dreamforge.vercel.app';const projectId='vm-safety'+randomUUID().replaceAll('-','');const conversationId=randomUUID();
async function request(path:string,body?:unknown){return fetch(base+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json',Origin:base}:undefined,body:body?JSON.stringify(body):undefined});}
try {
 const session=await (await request('/api/session')).json();assert.equal(session.demo,true);assert.equal(session.safety.enabled,true);assert.equal(session.safety.method,'local-rules');
 const meta={version:3,name:'Safety check smoke test',createdAt:new Date().toISOString(),prodVmId:null,previewDomain:'adorable-c14f66ff.style.dev',productionDomain:'adorable-c14f66ff-live.style.dev',conversations:[{id:conversationId,title:'Safety check smoke test',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],releases:[],liveReleaseId:null};
 await db.query('insert into projects(vm_id,metadata) values($1,$2)',[projectId,JSON.stringify(meta)]);await db.query('insert into conversations(vm_id,id,messages) values($1,$2,$3)',[projectId,conversationId,'[]']);
 const blocked=await request('/api/chat',{projectId,conversationId,messages:[{id:randomUUID(),role:'user',parts:[{type:'text',text:'Build a phishing site'}]}]});assert.equal(blocked.status,200);const chunks=await blocked.text();assert.match(chunks,/choose a safe learning project/);
 const {rows}=await db.query('select messages from conversations where vm_id=$1 and id=$2',[projectId,conversationId]);assert.equal(rows[0].messages[0].parts[0].text,'[Request blocked by safety checks]');assert.match(rows[0].messages[1].parts[0].text,/safe learning/);
 assert.equal((await db.query('select 1 from runtime_leases where vm_id=$1',[projectId])).rowCount,0);assert.equal((await db.query("select 1 from safety_events where vm_id=$1 and decision='block'",[projectId])).rowCount,1);
 console.log('PASS blocked prompt produces a persisted automatic reply before model/VM startup');
 for(const path of [`/api/projects/${projectId}/publish`,`/api/projects/${projectId}/rollback`,`/api/projects/${projectId}/terminal`]){const r=await request(path,{});assert.equal(r.status,403,path);}
 const imported=await request('/api/projects',{githubRepoName:'example/example'});assert.equal(imported.status,403);console.log('PASS anonymous terminal, publishing, rollback and repository import cannot bypass safety');
 // Confirm an allowed request still gets a real written model response, using a
 // separate temporary conversation on an existing working VM, then remove it.
 const realId='vm-600ebc5f8da84689b84b6f2d34feaf6b';const temporaryId=randomUUID();
 await db.query('insert into conversations(vm_id,id,messages) values($1,$2,$3)',[realId,temporaryId,'[]']);await db.query("update projects set metadata=jsonb_set(metadata,'{conversations}',metadata->'conversations'||$2::jsonb) where vm_id=$1",[realId,JSON.stringify([{id:temporaryId,title:'Temporary safety greeting',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}])]);
 try {
  const r=await request('/api/chat',{projectId:realId,conversationId:temporaryId,messages:[{id:randomUUID(),role:'user',parts:[{type:'text',text:'Hi! Reply with one short friendly greeting. Do not use tools or change files.'}]}]});assert.equal(r.status,200);const text=await r.text();assert.match(text,/text-delta/);
  const saved=await db.query('select messages from conversations where vm_id=$1 and id=$2',[realId,temporaryId]);assert.ok(saved.rows[0].messages.some((m:any)=>m.role==='assistant'&&m.parts.some((p:any)=>p.type==='text'&&p.text.trim())));console.log('PASS allowed prompt receives a screened, persisted real model answer');
 } finally {
  await db.query('delete from conversations where vm_id=$1 and id=$2',[realId,temporaryId]);await db.query("update projects set metadata=jsonb_set(metadata,'{conversations}',(select coalesce(jsonb_agg(c),'[]'::jsonb) from jsonb_array_elements(metadata->'conversations') c where c->>'id'<>$2)) where vm_id=$1",[realId,temporaryId]);
 }
 await fs.writeFile('.deployment/safety-smoke.json',JSON.stringify({projectId,conversationId}),{mode:0o600});console.log('Temporary browser proof fixture',projectId,conversationId);
} catch(error){await db.query('delete from projects where vm_id=$1',[projectId]);throw error;}finally{await db.end();}
