import { authorizeProject } from '@/lib/project-access';
import { touchRuntime } from '@/lib/runtime-lifecycle';
export async function POST(_request:Request,{params}:{params:Promise<{projectId:string}>}){
 const {projectId}=await params;
 if(!/^vm-[a-z0-9]+$/.test(projectId))return Response.json({error:'Invalid project'},{status:400});
 if(!await authorizeProject(projectId))return Response.json({error:'Project not found'},{status:404});
 try{return Response.json(await touchRuntime(projectId));}catch{return Response.json({error:'The project could not resume. Please try again.'},{status:503});}
}
