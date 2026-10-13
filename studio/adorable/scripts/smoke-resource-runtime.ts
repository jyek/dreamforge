import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { createProjectVms, devVm } from '../lib/project-vm';
import { createConversation, readProjectMetadata, writeProjectMetadata } from '../lib/project-storage';
import { touchRuntime, pauseInactiveRuntimes } from '../lib/runtime-lifecycle';
import { publishProject } from '../lib/publish';
setDefaultAutoSelectFamilyAttemptTimeout(5000);
async function main(){
 process.env.RUNTIME_STATE_DIR='/tmp/adorable-runtime-smoke';
 const existing=process.env.SMOKE_PROJECT_ID;const prior=existing?await readProjectMetadata(existing):null;const created=prior?{projectId:existing!,previewDomain:prior.previewDomain,productionDomain:prior.productionDomain}:await createProjectVms('Small VM game');const vm=devVm(created.projectId);const info=await vm.data();
 assert.equal(info.resources.cpu,2);assert.equal(info.resources.memory,4096);assert.equal(info.idlePauseSeconds,300);
 console.log('PASS new project uses 2 vCPU, 4 GiB and 5-minute idle timeout',created.projectId);
 const source=await devVm('vm-7a92c5aca9de4d9d8f9ed3cf949bf7cd').fs.readTextFile('/workspace/app/page.tsx');await vm.fs.writeTextFile('/workspace/app/page.tsx',source);
 await writeProjectMetadata(created.projectId,{version:3,name:'Small VM game',createdAt:new Date().toISOString(),prodVmId:null,previewDomain:created.previewDomain,productionDomain:created.productionDomain,conversations:[],releases:[],liveReleaseId:null});
 const conversationId=randomUUID();await createConversation(created.projectId,conversationId,'Small VM smoke test');
 await touchRuntime(created.projectId);await pauseInactiveRuntimes(Date.now()+5*60*1000+1000);
 assert.equal((await vm.data()).state,'paused');console.log('PASS inactivity sweep pauses the project');
 const persisted=await readProjectMetadata(created.projectId);assert.equal(persisted.name,'Small VM game');assert.equal((await vm.data()).state,'paused');console.log('PASS JSON metadata remains readable while paused');
 await touchRuntime(created.projectId);assert.equal((await vm.data()).state,'running');console.log('PASS returning student resumes the same VM');
 const releaseId=await publishProject(created.projectId,'Static publishing smoke test');
 for(let attempt=0;attempt<100;attempt++){
  const metadata=await readProjectMetadata(created.projectId);const release=metadata.releases.find(item=>item.id===releaseId)!;
  if(release.state==='failed')throw Error(release.error||'Publish failed');
  if(release.state==='live'){
   assert.equal(release.hosting,'static');assert.equal(metadata.prodVmId,null);assert(metadata.staticProductionUrl);
   console.log('PASS published game has no production VM',metadata.staticProductionUrl);
   await vm.pause();const page=await fetch(metadata.staticProductionUrl);assert.equal(page.status,200);assert((await page.text()).includes('Adorable is live'));
   assert.equal((await vm.data()).state,'paused');console.log('PASS static game loads while development VM stays paused');
   console.log(JSON.stringify({projectId:created.projectId,conversationId,url:metadata.staticProductionUrl,releaseId}));return;
  }
  await new Promise(resolve=>setTimeout(resolve,4000));
 }
 throw Error('Publish did not complete in time');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
