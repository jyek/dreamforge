import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.argv[2];
if(!origin?.startsWith('https://'))throw Error('Pass the Vercel origin');
const check=async(path,init={},status=200)=>{
 const response=await fetch(origin+path,{...init,signal:AbortSignal.timeout(90000)});
 assert.equal(response.status,status,`${path}: ${await response.clone().text().then(s=>s.slice(0,200))}`);
 return response;
};
const mutation=body=>({method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const created=JSON.parse(await fs.readFile(".deployment/vercel-smoke-project.json"));
const publish=await (await check(`/api/projects/${created.id}/publish`,mutation({message:'Vercel smoke verification'}))).json();
for(let attempt=0;attempt<60;attempt++){
 const list=await (await check('/api/projects')).json();const project=list.projects.find(p=>p.id===created.id);const release=project.releases.find(r=>r.id===publish.releaseId);
 if(release.state==='failed')throw Error(release.error);
 if(release.state==='live'){
  const published=await fetch(project.productionUrl,{signal:AbortSignal.timeout(20000)});assert.equal(published.status,200);
  console.log('PASS background publishing completed after the Vercel request returned');break;
 }
 if(attempt===59)throw Error('Publishing did not complete');
 await new Promise(resolve=>setTimeout(resolve,5000));
}
