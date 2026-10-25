import 'dotenv/config';
import assert from 'node:assert/strict';
import {setDefaultAutoSelectFamilyAttemptTimeout} from 'node:net';
import {devVm} from '../lib/project-vm';
import {publishProject,rollbackToRelease} from '../lib/publish';
import {readProjectMetadata,setProdVmId} from '../lib/project-storage';
import {freestyle} from '../lib/freestyle';
async function main(){
 setDefaultAutoSelectFamilyAttemptTimeout(5000);process.env.RUNTIME_STATE_DIR='/tmp/adorable-runtime-smoke';
 const id='vm-600ebc5f8da84689b84b6f2d34feaf6b',vm=devVm(id),before=await readProjectMetadata(id);
 assert(before.liveReleaseId&&before.staticProductionUrl);const staticRelease=before.liveReleaseId;
 let temporaryProd:string|null=null;
 try {
  await vm.exec({command:'mkdir -p /workspace/app/api/smoke-runtime'});
  await vm.fs.writeTextFile('/workspace/app/api/smoke-runtime/route.ts','export async function GET(){return Response.json({smoke:"server-fallback-ok"});}');
  const releaseId=await publishProject(id,'Server fallback smoke test');
  for(let attempt=0;attempt<90;attempt++){
   const meta=await readProjectMetadata(id);temporaryProd=meta.prodVmId;const release=meta.releases.find(r=>r.id===releaseId)!;
   if(release.state==='failed')throw Error(release.error||'Server publish failed');
   if(release.state==='live'){
    assert.equal(release.hosting,'server');assert(temporaryProd);assert.equal(meta.staticProductionUrl,null);
    const prod=await freestyle.vms.get(temporaryProd);assert.equal(prod.resources.memory,4096);assert.equal(prod.idleTimeoutSeconds,1200);
    const response=await fetch(`https://${meta.productionDomain}/api/smoke-runtime`);assert.equal(response.status,200);assert.equal((await response.json()).smoke,'server-fallback-ok');
    console.log('PASS server-dependent app falls back to a small production VM and serves its API');
    await rollbackToRelease(id,staticRelease);const restored=await readProjectMetadata(id);assert.equal(restored.staticProductionUrl,before.staticProductionUrl);
    console.log('PASS rollback restores static release without rebuilding');return;
   }
   await new Promise(resolve=>setTimeout(resolve,3000));
  }
  throw Error('Server publish timed out');
 } finally {
  await vm.fs.remove('/workspace/app/api/smoke-runtime').catch(()=>{});
  if(temporaryProd){await rollbackToRelease(id,staticRelease).catch(()=>{});await setProdVmId(id,null);await freestyle.vms.delete(temporaryProd);console.log('Removed test-only production VM');}
  await vm.pause();
 }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
