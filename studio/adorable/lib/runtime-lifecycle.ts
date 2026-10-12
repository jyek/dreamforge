import fs from 'node:fs/promises';
import path from 'node:path';
import { database } from './database';
import { usesDatabaseStorage } from './project-storage';
import { freestyle } from './freestyle';
import { PROJECT_IDLE_SECONDS } from './vars';
import { startDevServer } from './project-vm';
import { wakeVm } from './runtime-readiness';
type Lease={lastActivity:number;pausedAt?:number};
type State={leases:Record<string,Lease>;queue:Promise<unknown>;jobs:Set<string>;sweeping?:boolean;timer?:ReturnType<typeof setInterval>};
const globalState=globalThis as unknown as {adorableRuntimeState?:State};
const state=globalState.adorableRuntimeState??={leases:{},queue:Promise.resolve(),jobs:new Set()};
const directory=()=>process.env.RUNTIME_STATE_DIR||path.join(process.cwd(),'.runtime');
let loading:Promise<void>|undefined;
const load=()=>loading??=fs.readFile(path.join(directory(),'leases.json'),'utf8').then(data=>{Object.assign(state.leases,JSON.parse(data));}).catch(()=>{});
const persist=()=>{state.queue=state.queue.then(async()=>{await fs.mkdir(directory(),{recursive:true,mode:0o700});const target=path.join(directory(),'leases.json');await fs.writeFile(target+'.tmp',JSON.stringify(state.leases),{mode:0o600});await fs.rename(target+'.tmp',target);});return state.queue;};
export async function touchRuntime(projectId:string){
 if (usesDatabaseStorage()) {
  const db=await database().connect();
  try {
   await db.query('begin');
   await db.query('insert into adorable.runtime_leases(vm_id,last_activity) values($1,now()) on conflict(vm_id) do update set last_activity=now(),paused_at=null',[projectId]);
   const vm=freestyle.vms.ref(projectId);await wakeVm(vm,()=>startDevServer(vm));
   await db.query('commit');
   return {state:'active',idleSeconds:PROJECT_IDLE_SECONDS};
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
 }
 await load();state.leases[projectId]={lastActivity:Date.now()};await persist();
 const vm=freestyle.vms.ref(projectId);await wakeVm(vm,()=>startDevServer(vm));
 return {state:'active',idleSeconds:PROJECT_IDLE_SECONDS};
}
export async function holdRuntime(projectId:string){
 await touchRuntime(projectId);
 if (usesDatabaseStorage()) {
  // A bounded durable lease survives function shutdown, but cannot hold a VM forever.
  await database().query("update adorable.runtime_leases set hold_until=now()+interval '6 minutes' where vm_id=$1",[projectId]);
  return async()=>{await database().query('update adorable.runtime_leases set hold_until=null,last_activity=now() where vm_id=$1',[projectId]);};
 }
 state.jobs.add(projectId);
 return async()=>{state.jobs.delete(projectId);state.leases[projectId]={lastActivity:Date.now()};await persist();};
}
export async function pauseInactiveRuntimes(now=Date.now()){
 if (usesDatabaseStorage()) {
  const db=await database().connect();
  try {
   await db.query('begin');
   await db.query(`update adorable.projects p set metadata=jsonb_set(p.metadata,'{releases}',(select jsonb_agg(case when r->>'state'='publishing' and (r->>'createdAt')::timestamptz < now()-interval '6 minutes' then r || '{"state":"failed","error":"Publishing timed out. Try again."}'::jsonb else r end order by ord) from jsonb_array_elements(p.metadata->'releases') with ordinality as items(r,ord))),updated_at=now()
    where exists(select 1 from jsonb_array_elements(p.metadata->'releases') r where r->>'state'='publishing' and (r->>'createdAt')::timestamptz < now()-interval '6 minutes')`);
   const {rows}=await db.query(`select vm_id from adorable.runtime_leases where last_activity < to_timestamp($1/1000.0)-($2 * interval '1 second') and paused_at is null and (hold_until is null or hold_until < now()) order by last_activity limit 10 for update skip locked`,[now,PROJECT_IDLE_SECONDS]);
   for(const row of rows){
    const vm=freestyle.vms.ref(row.vm_id);const info=await vm.data();
    if(info.state==='running')await vm.pause();
    await db.query('update adorable.runtime_leases set paused_at=now() where vm_id=$1',[row.vm_id]);
   }
   await db.query('commit');
  }catch(error){await db.query('rollback');throw error;}finally{db.release();}
  return;
 }
 if(state.sweeping)return;state.sweeping=true;
 try {
 await load();
 for(const [id,lease] of Object.entries(state.leases)){
  if(state.jobs.has(id)||now-lease.lastActivity<PROJECT_IDLE_SECONDS*1000)continue;
  const expected=lease.lastActivity;
  try {const vm=freestyle.vms.ref(id);const info=await vm.data();
   if(state.leases[id]?.lastActivity!==expected||state.jobs.has(id))continue;
   if(info.state==='running')await vm.pause();
   else if(lease.pausedAt)continue;
   // A browser re-entry may have happened while pause was in flight.
   if(state.leases[id]?.lastActivity!==expected){await vm.start();continue;}
   state.leases[id]={lastActivity:expected,pausedAt:now};await persist();
  }catch{console.error('Project idle pause will be retried',id);}
 }
 } finally {state.sweeping=false;}
}
export async function startRuntimeWatchdog(){
 if(process.env.VERCEL)return;
 if(!usesDatabaseStorage())await load();if(state.timer)return;
 state.timer=setInterval(()=>{void pauseInactiveRuntimes().catch(()=>console.error('Idle watchdog failed'));},30000);state.timer.unref();
}
