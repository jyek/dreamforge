import { createClient } from '@supabase/supabase-js';
export const supabase=createClient('https://xntxjufcgtwtxeejzdtb.supabase.co','sb_publishable_kwWWa9Yu8xn2i_OS-kzpOQ_9n6zNCZY');
const checked=({data,error})=>{if(error)throw error;return data;};
async function allRows(table){
 const rows=[];for(let offset=0;;offset+=1000){const data=checked(await supabase.from(`dreamforge_${table}`).select('*').order(table==='courses'?'id':'created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+999));rows.push(...data);if(data.length<1000)return rows;}
}
export async function loadData(user){
 const results=await Promise.all(['classrooms','students','projects','prompts','assignments','courses'].map(allRows));
 const [classes,students,projects,prompts,assignments,courses]=results;
 return {
  classrooms:classes.map(c=>({id:c.id,name:c.name,owner:c.owner_id,code:c.join_code,students:students.filter(s=>s.classroom_id===c.id).map(s=>s.alias),members:students.filter(s=>s.classroom_id===c.id)})),
  projects:projects.map(p=>({id:p.id,title:p.title,kind:p.kind,classroom:p.classroom_id,owner:p.owner_id,createdAt:p.created_at,messages:prompts.filter(m=>m.project_id===p.id).map(m=>({text:m.content,author:m.author_id}))})),
  events:prompts.map(m=>{const p=projects.find(p=>p.id===m.project_id);return {id:m.id,projectId:m.project_id,projectTitle:p?.title||'Project',prompt:m.content,author:m.author_id,classroomName:classes.find(c=>c.id===p?.classroom_id)?.name||'Personal project',at:m.created_at};}),
  assignments:assignments.map(a=>({id:a.id,course:String(a.course_id),classroom:a.classroom_id})),
  courses:courses.map(c=>[c.title,c.description,c.audience,`${c.lesson_count} lessons`,c.kind]),
 };
}
export async function createClassroom(name,aliases){return checked(await supabase.rpc('dreamforge_create_classroom',{class_name:name,aliases}));}
export async function joinClassroom(code,alias){return checked(await supabase.rpc('dreamforge_join_classroom',{code,student_alias:alias}));}
export async function createProject(user,title,kind,classroom){return checked(await supabase.from('dreamforge_projects').insert({owner_id:user.id,title,kind,classroom_id:classroom||null}).select().single());}
export async function assignCourse(course,classroom){return checked(await supabase.from('dreamforge_assignments').insert({course_id:Number(course),classroom_id:classroom}));}
export async function sendPrompt(user,project,prompt){return checked(await supabase.from('dreamforge_prompts').insert({author_id:user.id,project_id:project,content:prompt}));}
