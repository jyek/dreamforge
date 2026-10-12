import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
const env=dotenv.parse(await fs.readFile('.env'));
const uri=new URL(env.DATABASE_URL);uri.port='6543';env.DATABASE_URL=uri.toString();
Object.assign(env,{PROJECT_STORAGE:'supabase',STUDENT_LOGIN_ENABLED:'false',SAFETY_ENABLED:'true',STUDENT_AI_PROVIDER_APPROVED:'false',CRON_SECRET:randomBytes(32).toString('hex')});
const keys=['DATABASE_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','FREESTYLE_API_KEY','FREESTYLE_BASE_URL','FREESTYLE_DOMAIN_SUFFIX','OPENROUTER_API_KEY','OPENAI_BASE_URL','LLM_MODEL','LLM_MAX_OUTPUT_TOKENS','STATIC_PUBLISH_URL','STATIC_PUBLISH_TOKEN','PROJECT_STORAGE','STUDENT_LOGIN_ENABLED','SAFETY_ENABLED','STUDENT_AI_PROVIDER_APPROVED','CRON_SECRET'];
for(const key of keys){
 if(!env[key])throw Error(`Missing ${key}`);
 const result=spawnSync('vercel',['env','add',key,'production','--scope','jyek-projects'],{input:env[key],encoding:'utf8'});
 if(result.status!==0)throw Error(`Could not configure ${key}: ${result.stderr}`);
 console.log(`Configured ${key}`);
}
await fs.writeFile('.deployment/vercel-environment.json',JSON.stringify({cronSecret:env.CRON_SECRET}),{mode:0o600});
const auth=JSON.parse(await fs.readFile('/Users/justinyek/Library/Application Support/com.vercel.cli/auth.json'));
const project=JSON.parse(await fs.readFile('.vercel/project.json'));
const response=await fetch(`https://api.vercel.com/v9/projects/${project.projectId}?teamId=${project.orgId}`,{method:'PATCH',headers:{Authorization:`Bearer ${auth.token}`,'Content-Type':'application/json'},body:JSON.stringify({framework:'nextjs',ssoProtection:null,nodeVersion:'24.x'})});
if(!response.ok)throw Error(`Vercel project configuration failed (${response.status})`);
console.log('Direct public deployment configured');
