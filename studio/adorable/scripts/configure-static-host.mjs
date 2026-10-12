import fs from 'node:fs/promises';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
console.log('Ready for static hosting configuration (input hidden).');
let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',async chunk=>{
 input+=chunk;if(!input.includes('\n'))return;
 try {const config=JSON.parse(input.split('\n')[0]);let env=await fs.readFile('.env','utf8');
 for(const [key,value] of Object.entries({STATIC_PUBLISH_URL:config.url,STATIC_PUBLISH_TOKEN:config.token,RUNTIME_STATE_DIR:config.stateDir||'/app/runtime-state'})){
  if(typeof value!=='string'||value.includes('\n'))throw Error('Invalid configuration');
  env=env.replace(new RegExp(`^${key}=.*\\n?`,'gm'),'');env+=`\n${key}=${value}\n`;
 }
 await fs.writeFile('.env',env,{mode:0o600});console.log('Static hosting configured.');process.exit(0);
 }catch {console.error('Invalid configuration');process.exit(1)}
});
