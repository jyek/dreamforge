import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Freestyle } from 'freestyle';
const env=dotenv.parse(await fs.readFile('.env'));
const f=new Freestyle({apiKey:env.FREESTYLE_API_KEY,baseUrl:env.FREESTYLE_BASE_URL});
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},max:1});
const {id}=JSON.parse(await fs.readFile('.deployment/vercel-smoke-project.json'));
try{
 const {rows}=await pool.query('select metadata from adorable.projects where vm_id=$1',[id]);const metadata=rows[0]?.metadata;
 if(!metadata||metadata.name!=='Vercel migration verification')throw Error('Test project identity does not match');
 const {rules}=await f.tls.rules.list({limit:200});
 for(const rule of rules.filter(rule=>[metadata.previewDomain,metadata.productionDomain].includes(rule.domain)))await f.tls.rules.delete(rule.id);
 await f.vms.delete(id);
 if(metadata.prodVmId)await f.vms.delete(metadata.prodVmId);
 await pool.query('delete from adorable.projects where vm_id=$1',[id]);
 await fs.rename('.deployment/vercel-smoke-project.json','.deployment/vercel-smoke-project.completed.json');
 console.log('PASS temporary test workspace, database rows and domain mappings removed');
}finally{await pool.end();}
