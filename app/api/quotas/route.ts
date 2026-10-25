import { database } from '@/lib/database';
import { getStudentSession } from '@/lib/student-session';
export async function GET(){
 const user=await getStudentSession();if(!user)return Response.json({error:'Sign in first'},{status:401});
 const {rows}=await database().query(`select coalesce(b.token_limit,200000)::int as token_limit,coalesce(b.used_tokens,0)::int as used_tokens,coalesce(b.reserved_tokens,0)::int as reserved_tokens from (select $1::uuid as id) u left join token_budgets b on b.user_id=u.id and b.day=(now() at time zone 'UTC')::date`,[user.id]);
 return Response.json({...rows[0],resetsAt:'00:00 UTC',providerApproved:process.env.STUDENT_AI_PROVIDER_APPROVED==='true',moderationReady:!!process.env.STUDENT_MODERATION_URL});
}
export async function POST(req:Request){
 const user=await getStudentSession();if(!user)return Response.json({error:'Sign in first'},{status:401});
 const b=await req.json();if(!Number.isSafeInteger(b.tokenLimit)||b.tokenLimit<0||b.tokenLimit>10000000||typeof b.studentId!=='string')return Response.json({error:'Invalid budget'},{status:400});
 const {rows}=await database().query(`select 1 from students st join classrooms c on c.id=st.classroom_id where st.user_id=$1 and c.owner_id=$2 and c.id=$3`,[b.studentId,user.id,b.classroomId]);
 if(!rows.length)return Response.json({error:'Only the assigned teacher can change this budget.'},{status:403});
 await database().query(`insert into token_budgets(user_id,day,token_limit) values($1,(now() at time zone 'UTC')::date,$2) on conflict(user_id,day) do update set token_limit=excluded.token_limit`,[b.studentId,b.tokenLimit]);
 return Response.json({ok:true});
}
