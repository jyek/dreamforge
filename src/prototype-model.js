import {seed as original} from './prototype-data.js';
export function createWorkspace(){
 const d=structuredClone(original);d.version=2;d.policies.studentSharing=true;d.school='School A';d.billing={subscription:99,rate:0.02,credits:120000,topups:[],mode:'Prepaid + pay as you go'};
 const names=['Jamie Ng','Priya Shah','Amir Hassan','Grace Ong','Ethan Wong','Sarah Chua','Lucas Chen','Nora Lim','Isaac Goh','Emma Teo','Ryan Koh','Aisha Rahman','Ben Tan','Chloe Lee','Oliver Yeo','Sofia Ho','Nathan Tay','Isabel Low'];
 names.forEach((name,i)=>{const teacher='teacher-'+i,classroom='room-'+i;d.teachers.push({id:teacher,name,subject:'Creative learning',email:'teacher'+i+'@example.school'});d.classrooms.push({id:classroom,name:`Primary ${4+i%3} · Studio ${i+1}`,teacher,code:'STUDIO'+(i+1),course:i%3,next:'Friday, 10:00 AM'});for(let n=0;n<3;n++)d.students.push({id:classroom+'-'+n,name:['Robin','Sky','Morgan'][n]+' '+(i+1),classroom,initials:['RO','SK','MO'][n]});d.projects.push({id:'idea-'+i,title:['Animal Habitat','Kindness Board','Space Explorer'][i%3]+' '+(i+1),student:classroom+'-0',classroom,kind:'AI',status:'In progress',progress:30+i%5*10,messages:['Help me make a learning tool for my class.'],feedback:''});});
 d.classrooms.forEach((c,i)=>Object.assign(c,{session:'Live',screenLimit:45,elapsed:18,tokenLimit:15000,tokenUsed:i===0?12500:1800+i*130,buffer:1500,broadcast:'',poll:null}));
 d.students.forEach(s=>Object.assign(s,{tokenLimit:5000,tokenUsed:s.id==='alex'?4100:900,screenUsed:18,stuck:s.id==='sam',enabled:true}));
 d.projects.forEach(p=>Object.assign(p,{scope:'Personal',members:[p.student],verification:null,approval:null,deployed:false,held:false,revision:1}));
 d.projects.push({id:'teamspark',title:'Our Kindness Wall',student:'alex',members:['alex','sam','jules'],classroom:'5a',scope:'Shared',kind:'AI',status:'In progress',progress:45,messages:['Build a board where classmates can celebrate kind acts.'],feedback:'Make sure shared notes never include private information.',verification:null,approval:null,deployed:false,held:false,revision:1});
 d.prompts=[{id:'auto-block',student:'jules',project:'garden',classroom:'5a',text:'Collect everyone’s home address for the garden.',status:'Blocked automatically',tokens:0,reason:'Personal information',time:'09:38'}, {id:'pending',student:'sam',project:'water',classroom:'5a',text:'Publish my classmates’ contact details on the public page.',status:'Queued',tokens:0,reason:'Awaiting generation',time:'09:42'}, ...d.projects.slice(0,6).map((p,i)=>({id:'record-'+i,student:p.student,project:p.id,classroom:p.classroom,text:p.messages[0],status:'Allowed',tokens:480,time:'09:'+String(30+i).padStart(2,'0')}))];
 d.chats=[{id:'hello',student:'alex',from:'teacher',text:'Hi Alex! Test your hints with a classmate before requesting approval.',time:'09:40'}];return d;
}
export const editable=(p,id='alex')=>p?.members?.includes(id)||p?.student===id;
export function promptGate(d,p,text){
 const c=d.classrooms.find(c=>c.id===p.classroom),s=d.students.find(s=>s.id==='alex');
 if(!editable(p))return 'This is a read-only classmate project.';
 if(!s.enabled)return 'Your account is paused. Ask your teacher for help.';
 if(p.held)return 'Your teacher paused this project. Send them a message.';
 if(c?.session!=='Live')return 'Class is '+(c?.session||'stopped').toLowerCase()+'. Your teacher can restart it.';
 if(s.screenUsed>=c.screenLimit)return 'Screen time is up. Take a break and ask your teacher.';
 const cost=Math.ceil(text.length/4)+400;
 if(s.tokenUsed+cost>s.tokenLimit)return 'You reached your token limit. Ask your teacher for more.';
 if(c.tokenUsed+cost>c.tokenLimit)return 'Your classroom reached its token limit. Ask your teacher to release a buffer.';
 if(d.billing.mode==='Prepaid'&&cost>d.billing.credits)return 'School token balance is empty. Ask your teacher.';
 return null;
}
export function submitPrompt(d,p,text){
 if(!text.trim())return {error:'Write a prompt first.'};
 const error=promptGate(d,p,text);if(error)return {error};
 const blocked=/home address|password|phone number|hurt someone|weapon|private photo/i.test(text),tokens=blocked?0:Math.ceil(text.length/4)+400;
 const record={id:crypto.randomUUID(),student:'alex',project:p.id,classroom:p.classroom,text,status:blocked?'Blocked automatically':'Allowed',tokens,reason:blocked?'Safety rule triggered':'Sample generation',time:new Date().toLocaleTimeString('en-SG',{hour:'2-digit',minute:'2-digit'})};d.prompts.unshift(record);
 if(!blocked){const c=d.classrooms.find(c=>c.id===p.classroom),s=d.students.find(s=>s.id==='alex');c.tokenUsed+=tokens;s.tokenUsed+=tokens;d.billing.credits=Math.max(0,d.billing.credits-tokens);p.messages.push(text);p.progress=Math.min(95,p.progress+10);p.revision++;p.verification=null;p.approval=null;p.deployed=false;p.status='In progress';s.screenUsed++;}
 return {blocked,tokens};
}
export function approveProject(p){if(p.held||p.status!=='Awaiting approval'||p.verification?.revision!==p.revision)return false;p.approval={revision:p.revision,teacher:'mia'};p.status='Approved';return true;}
export function deployProject(p,d){if(p.held)return 'Your teacher paused this project. Ask them to review it.';if(!d.policies.studentSharing)return 'Public sharing is disabled by your school.';if(p.approval?.revision!==p.revision||p.verification?.revision!==p.revision)return 'Complete verification and get teacher approval first.';p.deployed=true;p.progress=100;p.status='Published';return null;}
export function stopPrompt(d,id){const r=d.prompts.find(r=>r.id===id);if(!r||r.status.startsWith('Blocked')||r.status==='Stopped by teacher')return false;r.status='Stopped by teacher';r.reason='Teacher intervention';const p=d.projects.find(p=>p.id===r.project);if(p)p.held=true;return true;}
