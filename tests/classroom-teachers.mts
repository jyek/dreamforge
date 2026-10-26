import 'dotenv/config';import assert from 'node:assert/strict';import {randomBytes} from 'node:crypto';import {database} from '../lib/database';import {classroomAccess,classroomData,assignClassroomProject} from '../lib/classroom-data';import {classroomTeacherSQL,teacherStudentAccessSQL,sharedTeachingProjectSQL} from '../lib/classroom-permissions';
const db=database(),client=await db.connect();
try{await client.query('begin');const {rows}=await client.query(`select c.id as class_id,c.teacher_id,m.child_id,pr.id as co_id,pr.username,pr.display_name from classes c join class_members m on m.class_id=c.id cross join profiles pr where pr.role='teacher' and not ${classroomTeacherSQL('c.id','pr.id')} and not ${teacherStudentAccessSQL('m.child_id','pr.id')} limit 1`);assert.ok(rows.length,'Need a classroom student and a teacher without access for this transaction-only test.');const row=rows[0],co={id:row.co_id,username:row.username,display_name:row.display_name,role:'teacher' as const};
assert.equal(await classroomAccess(row.class_id,co,client),null);
await client.query('insert into class_teachers(class_id,teacher_id,added_by) values($1,$2,$3)',[row.class_id,co.id,row.teacher_id]);
assert.ok(await classroomAccess(row.class_id,co,client));const data=await classroomData(row.class_id,co,client);assert.ok(data?.teachers.some(t=>t.id===co.id));assert.ok(data?.students.some(s=>s.id===row.child_id));
assert.equal((await client.query(`select 1 where ${teacherStudentAccessSQL('$2')}`,[co.id,row.child_id])).rowCount,1);
const project='vm-'+randomBytes(16).toString('hex');await client.query('insert into projects(vm_id,owner_id,metadata) values($1,$2,$3)',[project,co.id,{version:3,name:'Transactional teacher sharing test',conversations:[]}]);
assert.equal(await assignClassroomProject(row.class_id,project,co,false,client),true);
assert.ok((await classroomData(row.class_id,co,client))?.projects.some(p=>p.vm_id===project));
assert.equal((await client.query(`select 1 where ${sharedTeachingProjectSQL('$1','$2','$3')}`,[project,co.id,row.teacher_id])).rowCount,1);
await client.query('delete from class_teachers where class_id=$1 and teacher_id=$2',[row.class_id,co.id]);
assert.equal(await classroomAccess(row.class_id,co,client),null);
assert.equal((await client.query(`select 1 where ${teacherStudentAccessSQL('$2')}`,[co.id,row.child_id])).rowCount,0);
assert.equal(await assignClassroomProject(row.class_id,project,co,false,client),false);
assert.equal((await client.query('select 1 from projects where vm_id=$1 and owner_id=$2',[project,co.id])).rowCount,1);
console.log('Passed co-teacher classroom/student visibility, teaching-project sharing and membership revocation; all changes rolled back.');
}finally{await client.query('rollback');client.release();await db.end();}
