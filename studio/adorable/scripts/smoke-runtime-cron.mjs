import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Freestyle } from 'freestyle';
const env=dotenv.parse(await fs.readFile('.env'));
const freestyle=new Freestyle({apiKey:env.FREESTYLE_API_KEY,baseUrl:env.FREESTYLE_BASE_URL});
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},max:1});
const {id}=JSON.parse(await fs.readFile('.deployment/vercel-smoke-project.json'));
const origin=process.argv[2];
try{
 await pool.query("update adorable.runtime_leases set last_activity=now()-interval '21 minutes',hold_until=null,paused_at=null where vm_id=$1",[id]);
 const {rows}=await pool.query('select command from cron.job where jobname=$1',['adorable-runtime-maintenance']);
 const {rows:requests}=await pool.query(rows[0].command);assert(requests.length);
 const requestId=requests[0].http_get;
 for(let attempt=0;attempt<25;attempt++){
  const {rows:responses}=await pool.query('select status_code,error_msg from net._http_response where id=$1',[requestId]);
  if(responses.length){assert.equal(responses[0].status_code,200,JSON.stringify(responses[0]));break;}
  if(attempt===24)throw Error('pg_net maintenance request did not complete');
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.equal((await freestyle.vms.ref(id).data()).state,'paused');
 console.log('PASS Supabase Cron HTTP request authenticated and paused the expired project');
 const response=await fetch(`${origin}/api/projects/${id}/runtime`,{method:'POST',headers:{Origin:origin},signal:AbortSignal.timeout(60000)});assert.equal(response.status,200);
 assert.equal((await freestyle.vms.ref(id).data()).state,'running');console.log('PASS Vercel activity endpoint resumes the same project');
}finally{await pool.end();}
