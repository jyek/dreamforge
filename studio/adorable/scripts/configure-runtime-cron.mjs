import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { Pool } from 'pg';
const env=dotenv.parse(await fs.readFile('.env'));
const {cronSecret}=JSON.parse(await fs.readFile('.deployment/vercel-environment.json'));
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},connectionTimeoutMillis:10000,max:1});
const origin=process.argv[2];
if(!origin?.startsWith('https://')||!new URL(origin).hostname.endsWith('.vercel.app'))throw Error('Pass the production Vercel origin');
try{
 await pool.query('create extension if not exists pg_cron');
 await pool.query('create extension if not exists pg_net');
 const {rows}=await pool.query('select id from vault.secrets where name=$1',['adorable-runtime-cron']);
 if(rows[0])await pool.query('select vault.update_secret($1,$2) ',[rows[0].id,cronSecret]);
 else await pool.query('select vault.create_secret($1,$2,$3)',[cronSecret,'adorable-runtime-cron','Vercel runtime maintenance authentication']);
 const {rows:command}=await pool.query(`select format($fmt$
 select net.http_get(url := %L, headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='adorable-runtime-cron')),timeout_milliseconds:=60000)
 where exists(select 1 from adorable.runtime_leases where last_activity < now()-interval '5 minutes' and paused_at is null and (hold_until is null or hold_until < now()))
 or exists(select 1 from adorable.projects p,jsonb_array_elements(p.metadata->'releases') r where r->>'state'='publishing' and (r->>'createdAt')::timestamptz < now()-interval '6 minutes')
 $fmt$,$1::text) as sql`,[origin+'/api/cron/runtime']);
 const {rows:job}=await pool.query('select cron.schedule($1,$2,$3) as id',['adorable-runtime-maintenance','* * * * *',command[0].sql]);
 console.log('Runtime maintenance scheduled, Vault secret stored, job',job[0].id);
}finally{await pool.end();}
