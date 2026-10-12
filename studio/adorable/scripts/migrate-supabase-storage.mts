import fs from 'node:fs/promises';
import dotenv from 'dotenv';
import { Pool } from 'pg';
Object.assign(process.env,dotenv.parse(await fs.readFile('.env')));
const {Freestyle}=await import('freestyle');
const freestyle=new Freestyle({apiKey:process.env.FREESTYLE_API_KEY,baseUrl:process.env.FREESTYLE_BASE_URL});
const devVm=(id:string)=>freestyle.vms.ref(id);
const listProjectVms=async()=>{const {vms}=await freestyle.vms.list({metadata:'adorable:project,adorableRole:dev',limit:200});return vms;};
const connection=new URL(process.env.DATABASE_URL!);
connection.port='6543';
for(const key of ['sslmode','sslrootcert','sslcert','sslkey'])connection.searchParams.delete(key);
const pool=new Pool({connectionString:connection.toString(),ssl:{rejectUnauthorized:true,ca:await fs.readFile('config/supabase-ca.crt','utf8')},connectionTimeoutMillis:10000,max:1});
try {
 await pool.query('select 1');
 await pool.query(await fs.readFile('supabase/migrations/202610120001_adorable_storage.sql','utf8'));
 let conversations=0;
 const vms=await listProjectVms();
 for(const vm of vms){
  if((await pool.query('select 1 from adorable.projects where vm_id=$1',[vm.id])).rowCount)continue;
  const metadata=JSON.parse(await devVm(vm.id).fs.readTextFile('/adorable/project.json'));
  const messages=[];
  for(const conversation of metadata.conversations){messages.push({id:conversation.id,data:JSON.parse(await devVm(vm.id).fs.readTextFile(`/adorable/conversations/${conversation.id}.json`))});}
  const db=await pool.connect();
  try {
   await db.query('begin');
   const {rowCount}=await db.query('insert into adorable.projects(vm_id,metadata) values($1,$2) on conflict(vm_id) do nothing',[vm.id,JSON.stringify(metadata)]);
   if(rowCount){
    for(const conversation of messages){await db.query('insert into adorable.conversations(vm_id,id,messages) values($1,$2,$3)',[vm.id,conversation.id,JSON.stringify(conversation.data)]);conversations++;}
    await db.query('insert into adorable.runtime_leases(vm_id,last_activity) values($1,now())',[vm.id]);
   }
   await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 }
 console.log(JSON.stringify({projects:vms.length,importedConversations:conversations,poolerVerified:true}));
}finally{await pool.end();}
