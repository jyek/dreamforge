"use client";
import { useCallback, useEffect, useState, useMemo } from "react";
import {highlightSource} from "@/lib/source-highlight";
import {WorkspaceLoading} from "./workspace-loading";
import "highlight.js/styles/github.css";
import { FileCode2Icon, RefreshCwIcon, SearchIcon } from "lucide-react";

export function ProjectCode({projectId}: {projectId:string}) {
  const [files,setFiles]=useState<string[]>([]),[selected,setSelected]=useState(""),[content,setContent]=useState(""),[query,setQuery]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(false),[revision,setRevision]=useState(0);
  const [filesLoading,setFilesLoading]=useState(true);
  const highlighted=useMemo(()=>highlightSource(content,selected),[content,selected]);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    const controller=new AbortController();
    setError("");setFilesLoading(true);
    fetch(`/api/projects/${projectId}/files`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error||"Could not load files");
      setFiles(data.files);setSelected(previous=>data.files.includes(previous)?previous:(data.files.includes("app/page.tsx")?"app/page.tsx":data.files[0]||""));
    }).catch(reason=>{if(reason.name!=="AbortError")setError(reason.message)}).finally(()=>{if(!controller.signal.aborted)setFilesLoading(false)});
    return()=>controller.abort();
  },[projectId,revision]);
  useEffect(()=>{
    if(!selected)return;
    const controller=new AbortController();setLoading(true);setError("");setContent("");
    fetch(`/api/projects/${projectId}/files?file=${encodeURIComponent(selected)}`,{signal:controller.signal,cache:"no-store"}).then(async response=>{
      const data=await response.json();if(!response.ok)throw Error(data.error||"Could not read file");setContent(data.content);
    }).catch(reason=>{if(reason.name!=="AbortError")setError(reason.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[projectId,selected,revision]);
  return <div className="flex h-full min-h-0 bg-white" aria-label="Project source code">
    <aside className="flex w-44 shrink-0 flex-col border-r bg-slate-50/70 sm:w-56">
      <div className="flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-600">FILES<button title="Refresh files" onClick={refresh} className="rounded p-1 hover:bg-slate-200"><RefreshCwIcon className="size-3.5"/></button></div>
      <label className="mx-3 mb-3 flex items-center gap-2 rounded-lg border bg-white px-2"><SearchIcon className="size-3 text-slate-400"/><input aria-label="Search files" placeholder="Find a file…" value={query} onChange={event=>setQuery(event.target.value)} className="h-8 min-w-0 w-full bg-transparent text-xs outline-none"/></label>
      <nav className="min-h-0 flex-1 overflow-auto px-2 pb-3" aria-label="Project files" aria-busy={filesLoading}>{filesLoading?<WorkspaceLoading label="Loading files…"/>:files.filter(file=>file.toLowerCase().includes(query.toLowerCase())).map(file=><button key={file} title={file} onClick={()=>setSelected(file)} aria-current={selected===file?"true":undefined} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${selected===file?"bg-blue-100 text-blue-700":"text-slate-600 hover:bg-slate-100"}`}><FileCode2Icon className="size-3.5 shrink-0"/><span className="truncate">{file}</span></button>)}</nav>
    </aside>
    <section className="flex min-w-0 flex-1 flex-col"><header className="flex shrink-0 items-center justify-between border-b px-4 py-3 text-xs"><span className="truncate font-mono text-slate-600">{selected||"Select a file"}</span><span className="ml-3 shrink-0 rounded bg-slate-100 px-2 py-1 text-slate-500">Read only</span></header>
      {error?<p role="alert" className="p-5 text-sm text-red-700">{error}</p>:loading||filesLoading?<WorkspaceLoading label={filesLoading?"Loading files…":"Loading code…"}/>:!selected?<p className="p-5 text-sm text-slate-400">No source files available.</p>:<div className="min-h-0 flex-1 overflow-auto p-4" aria-label="Highlighted source"><div className="flex min-w-max items-start text-[12px] leading-6"><pre aria-hidden="true" className="mr-5 w-9 shrink-0 select-none text-right text-slate-300">{content.split("\n").map((_,index)=>index+1).join("\n")}</pre><pre className="m-0"><code className="hljs !bg-transparent !p-0" dangerouslySetInnerHTML={{__html:highlighted}}/></pre></div></div>}

    </section>
  </div>;
}
