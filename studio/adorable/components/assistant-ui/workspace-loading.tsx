import {Loader2Icon} from 'lucide-react';
export function WorkspaceLoading({label='Loading conversation…'}:{label?:string}){
 return <div role="status" aria-live="polite" className="flex h-full min-h-32 flex-col items-center justify-center gap-3 text-sm text-slate-400"><Loader2Icon aria-hidden="true" className="size-5 animate-spin"/><span>{label}</span></div>;
}
