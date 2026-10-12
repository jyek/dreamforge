import fs from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { Freestyle } from 'freestyle';
const env=dotenv.parse(await fs.readFile('.env'));
const freestyle=new Freestyle({apiKey:env.FREESTYLE_API_KEY,baseUrl:env.FREESTYLE_BASE_URL});
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},max:1});
const receipt=JSON.parse(await fs.readFile('.deployment/backend.json'));
const backend=freestyle.vms.ref(receipt.vmId);
try{
 const healthy=await fetch('https://dreamforge.vercel.app/api/projects',{signal:AbortSignal.timeout(30000)});if(!healthy.ok)throw Error('Vercel is not healthy');
 const stopped=await backend.exec({command:'systemctl stop adorable',linuxUser:'root',timeoutMs:30000});if(stopped.statusCode!==0)throw Error('Could not stop the old backend service');
 const {vms}=await freestyle.vms.list({metadata:'adorable:project,adorableRole:dev',limit:200});
 let checked=0;
 for(const vm of vms){
  const legacy=await freestyle.vms.ref(vm.id).fs.readTextFile('/adorable/project.json').then(JSON.parse).catch(()=>null);
  if(!legacy)continue;
  const {rows}=await pool.query('select metadata from adorable.projects where vm_id=$1',[vm.id]);
  if(!rows[0]||!isDeepStrictEqual(legacy,rows[0].metadata))throw Error(`Metadata changed since migration for ${vm.id}; sync before retirement`);
  for(const c of legacy.conversations){
   const messages=JSON.parse(await freestyle.vms.ref(vm.id).fs.readTextFile(`/adorable/conversations/${c.id}.json`));
   const {rows:stored}=await pool.query('select messages from adorable.conversations where vm_id=$1 and id=$2',[vm.id,c.id]);
   if(!isDeepStrictEqual(messages,stored[0]?.messages))throw Error(`Conversation changed since migration for ${vm.id}; sync before retirement`);
  }
  checked++;
 }
 await backend.pause();
 if((await backend.data()).state!=='paused')throw Error('Backend did not pause');
 await fs.writeFile('.deployment/vercel-cutover.json',JSON.stringify({origin:'https://dreamforge.vercel.app',retiredVm:receipt.vmId,verifiedLegacyProjects:checked,completedAt:new Date().toISOString()}),{mode:0o600});
 console.log(`PASS old backend stopped and paused; ${checked} original projects and their histories match Supabase`);
}finally{await pool.end();}
