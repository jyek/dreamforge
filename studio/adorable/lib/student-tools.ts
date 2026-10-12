import { tool } from 'ai';
import { z } from 'zod';
import type { Vm } from 'freestyle';
import { codeRisk, redactIdentity, screenContent, SafetyError } from './kids-safety';
const fileSchema=z.string().max(240).regex(/^(app|src|components|styles|public)\/[A-Za-z0-9_./-]+\.(tsx?|jsx?|css|json|svg)$/);
function path(file:string){if(file.includes('..')||file.includes('/.')||file.includes('\\')||file.includes('/api/')||file.endsWith('middleware.ts'))throw new SafetyError('That file is outside your learning workspace.');return '/workspace/'+file;}
export function studentTools(vm:Vm,projectId:string,userId:string|null,aliases:string[]) {
 async function assertPlainPath(target:string) {
  const segments=target.split('/').filter(Boolean);
  const paths=segments.map((_,i)=>'/'+segments.slice(0,i+1).join('/'));
  const check=await vm.exec({command:paths.map(p=>`test ! -L '${p}'`).join(' && ')});
  if(check.statusCode!==0)throw new SafetyError('Linked files cannot be accessed.');
 }
 return {
  readFileTool:tool({description:'Read a source file within the learning workspace.',inputSchema:z.object({file:fileSchema}),execute:async({file})=>{const target=path(file);await assertPlainPath(target);const content=redactIdentity((await vm.fs.readTextFile(target)).slice(0,30000),aliases);await screenContent(projectId,userId,'tool',content);return {content};}}),
  writeFileTool:tool({description:'Write a complete safe source file. External network requests, secrets, system access and shell execution are unavailable.',inputSchema:z.object({file:fileSchema,content:z.string().max(30000)}),execute:async({file,content})=>{
   const target=path(file);const safe=redactIdentity(content,aliases);
   if(codeRisk(safe))throw new SafetyError('That code needs teacher review before it can run.');
   await screenContent(projectId,userId,'tool',safe);
   // vm.exec and filesystem APIs follow symlinks: refuse symlink ancestors before writing.
   await assertPlainPath(target);
   await vm.fs.writeTextFile(target,safe);return {ok:true,file};
  }}),
  listFilesTool:tool({description:'List the existing app source files.',inputSchema:z.object({}),execute:async()=>({entries:await vm.fs.readDir('/workspace/app')})}),
  checkAppTool:tool({description:'Check the application responds.',inputSchema:z.object({}),execute:async()=>{
   const r=await vm.exec({command:"curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/",timeoutMs:10000});return {ok:r.stdout?.trim()==='200',statusCode:r.stdout?.trim()};
  }})
 };
}
