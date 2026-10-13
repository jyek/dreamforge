import { randomUUID, createHash } from 'node:crypto';
import type { Vm } from './project-runtime';
export class StaticUnsupported extends Error {}
const quote=(value:string)=>`'${value.replace(/'/g,"'\\''")}'`;
async function request(path:string,init:RequestInit){
 const origin=process.env.STATIC_PUBLISH_URL,token=process.env.STATIC_PUBLISH_TOKEN;
 if(!origin||!token)throw Error('Static hosting is not configured');
 const response=await fetch(origin+path,{...init,headers:{...init.headers,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(60000)});
 if(!response.ok)throw Error(`Static host rejected the operation (${response.status})`);
 return response;
}
export async function activateStaticRelease(projectId:string,releaseId:string){
 await request(`/__publish/${projectId}/${releaseId}/activate`,{method:'POST'});
 return `${process.env.STATIC_PUBLISH_URL}/p/${projectId}`;
}
export async function exportAndPublishStatic(vm:Vm,projectId:string,releaseId:string){
 if(!process.env.STATIC_PUBLISH_URL||!process.env.STATIC_PUBLISH_TOKEN)throw new StaticUnsupported('Static hosting is not configured');
 const directory=`/tmp/adorable-export-${randomUUID()}`;
 const basePath=`/p/${projectId}/r/${releaseId}`;
 const prepare=await vm.exec({command:`mkdir -p ${quote(directory)} && tar -C /workspace --exclude='./node_modules' --exclude='./.next' --exclude='./.git' --exclude='./.env*' -cf - . | tar -xf - -C ${quote(directory)} && ln -s /workspace/node_modules ${quote(directory+'/node_modules')}`,timeoutMs:60000});
 if(prepare.statusCode!==0)throw Error('Could not prepare export');
 try {
  // Build a copy: static export settings never alter the student's dev app.
  const configure=`const fs=require('fs'),path=require('path');const root=${JSON.stringify(directory)},prefix=${JSON.stringify(basePath)};
 const walk=(dir)=>fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isSymbolicLink()?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]):[];
 const source=['app','src','components','hooks','lib'].flatMap(name=>walk(root+'/'+name));
 if(source.some(file=>/\\/(?:route\\.[cm]?[jt]s|middleware\\.[jt]s)$/.test(file))||source.some(file=>/['"]use server['"]|next\\/headers|['"]\\/api\\//.test(fs.readFileSync(file,'utf8')))){console.log('SERVER_REQUIRED');process.exit(42);}
 const configs=['next.config.ts','next.config.mjs','next.config.js'].filter(name=>fs.existsSync(root+'/'+name));const old=configs[0];
 const original=old?'adorable-original.config'+path.extname(old):null;if(old)fs.renameSync(root+'/'+old,root+'/'+original);
 const imports=original?'import original from "./'+original+'";':'const original={};';
 fs.writeFileSync(root+'/next.config.ts',imports+'\\nexport default async function(phase:any,context:any){const config:any=typeof original==="function"?await original(phase,context):original;return {...config,output:"export",basePath:'+JSON.stringify(prefix)+',trailingSlash:true,images:{...config.images,unoptimized:true},distDir:".next"};}');
 const assets=walk(root+'/public').map(file=>'/'+path.relative(root+'/public',file).split(path.sep).join('/'));
 for(const file of [...source,...walk(root+'/public')].filter(file=>/\\.(tsx?|jsx?|mjs|html|css)$/.test(file))){let content=fs.readFileSync(file,'utf8');for(const asset of assets){for(const mark of ['"',"'",'\\x60'])content=content.split(mark+asset+mark).join(mark+prefix+asset+mark);}fs.writeFileSync(file,content);}
 `;
  const configured=await vm.exec({command:`node -e ${quote(configure)}`,timeoutMs:60000});
  if(configured.statusCode===42)throw new StaticUnsupported('This project uses server features');
  if(configured.statusCode!==0)throw Error('Could not configure static export');
  const build=await vm.exec({command:`cd ${quote(directory)} && NEXT_TELEMETRY_DISABLED=1 node /workspace/node_modules/next/dist/bin/next build`,timeoutMs:300000});
  if(build.statusCode!==0){const detail=((build.stderr||'')+'\n'+(build.stdout||'')).slice(-4000);
   if(/output: ?["']?export|couldn.t be rendered statically|generateStaticParams|dynamic server usage|server actions are not supported|dynamic server error/i.test(detail))throw new StaticUnsupported('This project cannot be statically exported');
   throw Error('Static build failed: '+detail.slice(-600));
  }
  const listing=await vm.exec({command:`cd ${quote(directory+'/out')} && find . -type f -print0`,timeoutMs:15000});
  if(listing.statusCode!==0)throw Error('Export output was not produced');
  const files=(listing.stdout||'').split('\0').filter(Boolean).map(file=>file.replace(/^\.\//,''));
  if(!files.includes('index.html')||files.length>1000)throw Error('Invalid or oversized static export');
  let bytes=0;const manifest:{path:string;size:number;sha256:string}[]=[];
  for(let offset=0;offset<files.length;offset+=4){await Promise.all(files.slice(offset,offset+4).map(async file=>{
   if(file.split('/').some(segment=>segment==='..'||segment.startsWith('.env'))||file.includes('\\'))throw Error('Invalid export path');
   const content=Buffer.from(await vm.fs.readFile(directory+'/out/'+file));bytes+=content.length;
   if(content.length>10*1024*1024||bytes>50*1024*1024)throw Error('Static export exceeds the size limit');
   const sha256=createHash('sha256').update(content).digest('hex');
   await request(`/__publish/${projectId}/${releaseId}/files/${file.split('/').map(encodeURIComponent).join('/')}`,{method:'PUT',body:content});
   manifest.push({path:file,size:content.length,sha256});
  }));}
  await request(`/__publish/${projectId}/${releaseId}/commit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:manifest})});
  return `${process.env.STATIC_PUBLISH_URL}/p/${projectId}`;
 }finally {await vm.exec({command:`rm -rf ${quote(directory)}`,timeoutMs:15000}).catch(()=>{});}
}
