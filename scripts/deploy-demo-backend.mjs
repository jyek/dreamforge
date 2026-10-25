import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import { Freestyle } from 'freestyle';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';
setDefaultAutoSelectFamilyAttemptTimeout(5000);
const env=dotenv.parse(await fs.readFile(new URL('../.env',import.meta.url)));
const client=new Freestyle({apiKey:env.FREESTYLE_API_KEY,baseUrl:env.FREESTYLE_BASE_URL});
const stateDir=new URL('../.deployment/',import.meta.url);
await fs.mkdir(stateDir,{recursive:true,mode:0o700});
const receiptPath=new URL('backend.json',stateDir);
let receipt=await fs.readFile(receiptPath,'utf8').then(JSON.parse).catch(()=>null);
let vm;
if(receipt) vm=client.vms.ref(receipt.vmId);
else {
 const result=await client.vms.create({snapshotId:'freestyle/ubuntu',displayName:'DreamForge application backend',persistence:{type:'persistent'},firewall:{rules:[{action:'allow',source:{},destination:{public:true}}]},metadata:{application:'adorable-backend',site:'dreamforge-studio-demo'}});
 vm=result.vm; receipt={vmId:result.vmId,domain:`adorable-backend-${randomBytes(5).toString('hex')}.style.dev`,proxySecret:randomBytes(32).toString('hex')};
 await fs.writeFile(receiptPath,JSON.stringify(receipt),{mode:0o600});
}
console.log('Backend VM',receipt.vmId);
const run=async(command,root=false)=>{const r=await vm.exec({command,linuxUser:root?'root':undefined,timeoutMs:300000});if(r.statusCode!==0)throw new Error(r.stderr||r.stdout);return r.stdout.trim()};
const user=await run('id -un');
if(!/^[a-z_][a-z0-9_-]*$/.test(user)) throw new Error('Invalid VM user');
await run(`mkdir -p /app && chown ${user}:${user} /app`,true);
await vm.fs.writeFile('/app/runtime.tgz',await fs.readFile('/tmp/adorable-runtime.tgz'));
await run('tar -xzf /app/runtime.tgz -C /app && rm /app/runtime.tgz');
const keys=['FREESTYLE_API_KEY','FREESTYLE_BASE_URL','FREESTYLE_DOMAIN_SUFFIX','OPENROUTER_API_KEY','OPENAI_BASE_URL','LLM_MODEL','LLM_MAX_OUTPUT_TOKENS','STATIC_PUBLISH_URL','STATIC_PUBLISH_TOKEN'];
const runtime=Object.fromEntries(keys.map(k=>[k,env[k]]).filter(([,v])=>v));
Object.assign(runtime,{STUDENT_LOGIN_ENABLED:'false',STUDENT_AI_PROVIDER_APPROVED:'false',SITES_PROXY_SECRET:receipt.proxySecret,PUBLIC_APP_ORIGIN:'https://dreamforge-studio-demo.jyek.chatgpt.site',NODE_ENV:'production',PORT:'3000',HOSTNAME:'0.0.0.0',RUNTIME_STATE_DIR:'/app/runtime-state'});
await run(`mkdir -p /app/runtime-state && chown ${user}:${user} /app/runtime-state`,true);
await vm.fs.writeFile('/app/runtime.env',Object.entries(runtime).map(([k,v])=>`${k}=${v}`).join('\n')+'\n');
await run('chmod 600 /app/runtime.env',true);
const node=await run('command -v node');
await vm.fs.writeFile('/app/adorable.service',`[Unit]\nDescription=DreamForge application\nAfter=network.target\n[Service]\nType=simple\nUser=${user}\nWorkingDirectory=/app/adorable\nEnvironmentFile=/app/runtime.env\nExecStart=${node} /app/adorable/server.js\nRestart=always\nRestartSec=3\n[Install]\nWantedBy=multi-user.target\n`);
await run('cp /app/adorable.service /etc/systemd/system/adorable.service && systemctl daemon-reload && systemctl enable adorable && systemctl restart adorable',true);
console.log('Application service started');
if(!receipt.mapped){await client.tls.rules.create({action:'allow',domain:receipt.domain,source:{public:true},destination:{vmId:receipt.vmId,port:3000}});receipt.mapped=true;await fs.writeFile(receiptPath,JSON.stringify(receipt),{mode:0o600});}
console.log('Backend HTTPS',`https://${receipt.domain}`);
for(let i=0;i<20;i++){await new Promise(r=>setTimeout(r,1500));const r=await fetch(`https://${receipt.domain}/api/projects`,{headers:{'x-sites-backend-token':receipt.proxySecret}}).catch(()=>null);if(r?.ok){console.log('Backend project list verified',((await r.json()).projects||[]).length);process.exit(0)}}
console.log(await run('journalctl -u adorable -n 15 --no-pager',true));
throw new Error('Backend did not become healthy');
