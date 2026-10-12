import { pauseInactiveRuntimes } from "@/lib/runtime-lifecycle";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return Response.json({error:"Unauthorized"},{status:401});
  await pauseInactiveRuntimes();
  return Response.json({ok:true});
}
