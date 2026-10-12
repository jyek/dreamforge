import 'dotenv/config';
import { Freestyle } from 'freestyle';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
import { activityCommand } from './activity-bridge.mjs';
setDefaultAutoSelectFamilyAttemptTimeout(5000);
const client=new Freestyle({apiKey:process.env.FREESTYLE_API_KEY,baseUrl:process.env.FREESTYLE_BASE_URL});
const {vms}=await client.vms.list({limit:200});
for(const data of vms.filter(vm=>vm.metadata?.adorable==='project')){
 const vm=client.vms.ref(data.id);await vm.update({idleTimeoutSeconds:1200});
 if(data.metadata.adorableRole==='dev'){
  const bridge=await vm.exec({command:activityCommand,timeoutMs:30000});if(bridge.statusCode!==0)throw Error('Activity bridge installation failed');
  const response=await fetch(`https://dreamforge-studio-demo.jyek.chatgpt.site/api/projects/${data.id}/runtime`,{method:'POST',headers:{Origin:'https://dreamforge-studio-demo.jyek.chatgpt.site'},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Lease registration failed: ${response.status}`);
 }
 console.log('Configured 20-minute idle policy',data.id,data.metadata.adorableRole);
}
