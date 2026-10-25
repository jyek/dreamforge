export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'){
  const {startRuntimeWatchdog}=await import('./lib/runtime-lifecycle');await startRuntimeWatchdog();
 }
}
