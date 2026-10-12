import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import { database } from '../lib/database';
import {writeProjectMetadata,readProjectMetadata,createConversation,saveConversationMessages,readConversationMessages,renameProject} from '../lib/project-storage';
Object.assign(process.env,dotenv.parse(await fs.readFile('.env')));
process.env.PROJECT_STORAGE='supabase';
const connection=new URL(process.env.DATABASE_URL!);connection.port='6543';process.env.DATABASE_URL=connection.toString();
const id='vm-'+randomUUID().replaceAll('-','');
try {
 await writeProjectMetadata(id,{version:3,name:'Storage verification',createdAt:new Date().toISOString(),prodVmId:null,previewDomain:'test.invalid',productionDomain:'test.invalid',conversations:[],releases:[],liveReleaseId:null});
 const a=randomUUID(),b=randomUUID();
 await Promise.all([createConversation(id,a,'A'),createConversation(id,b,'B')]);
 assert.equal((await readProjectMetadata(id)).conversations.length,2);
 const messages=[{id:randomUUID(),role:'user' as const,parts:[{type:'text' as const,text:'Persisted in Supabase'}]}];
 await Promise.all([saveConversationMessages(id,a,messages),renameProject(id,'Updated concurrently')]);
 assert.deepEqual(await readConversationMessages(id,a),messages);
 const metadata=await readProjectMetadata(id);assert.equal(metadata.name,'Updated concurrently');assert.equal(metadata.conversations.length,2);assert.equal(metadata.conversations.find(c=>c.id===a)?.title,'Persisted in Supabase');
 await assert.rejects(()=>saveConversationMessages(id,randomUUID(),messages),/Conversation not found/);
 await assert.rejects(()=>readConversationMessages(id,'../secret'),/Invalid conversation/);
 console.log('PASS concurrent conversations, atomic metadata/chat saves, invalid conversation rejection');
 const {rows}=await database().query("select tablename,rowsecurity from pg_tables where schemaname='adorable'");assert(rows.every(r=>r.rowsecurity));console.log('PASS RLS enabled on all Adorable storage tables');
}finally{await database().query('delete from adorable.projects where vm_id=$1',[id]);await database().end();}
