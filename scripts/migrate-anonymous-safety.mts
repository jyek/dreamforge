import fs from 'node:fs/promises';import dotenv from 'dotenv';import {Pool} from 'pg';
const env=dotenv.parse(await fs.readFile('.env'));const uri=new URL(env.DATABASE_URL);uri.port='6543';for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])uri.searchParams.delete(key);
const pool=new Pool({connectionString:uri.toString(),ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},max:1,connectionTimeoutMillis:10000});
try{await pool.query(await fs.readFile('supabase/migrations/202610120003_anonymous_safety.sql','utf8'));console.log('Anonymous safety audit table ready');}finally{await pool.end();}
