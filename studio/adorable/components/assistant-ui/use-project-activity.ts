"use client";
import { useEffect, useRef, useState } from 'react';
export function useProjectActivity(projectId:string,previewUrl:string,iframeRef:React.RefObject<HTMLIFrameElement|null>,running:boolean){
 const [idle,setIdle]=useState(false),[error,setError]=useState('');
 const lastActivity=useRef(Date.now()),lastSent=useRef(0),inFlight=useRef(false);
 const resume=async()=>{
  lastActivity.current=Date.now();setError('');
  try{const response=await fetch(`/api/projects/${projectId}/runtime`,{method:'POST'});if(!response.ok)throw Error('Could not resume this project. Try again.');lastSent.current=Date.now();setIdle(false);}catch(reason){setError((reason as Error).message);}
 };
 useEffect(()=>{
  lastActivity.current=Date.now();lastSent.current=0;setIdle(false);void resume();
  const activity=()=>{lastActivity.current=Date.now();};
  const message=(event:MessageEvent)=>{if(event.source===iframeRef.current?.contentWindow&&event.origin===new URL(previewUrl).origin&&event.data?.type==='adorable:preview-activity')activity();};
  const events=['pointerdown','keydown','wheel','touchstart'];events.forEach(event=>window.addEventListener(event,activity,{passive:true}));window.addEventListener('message',message);
  const timer=setInterval(()=>{
   if(running)lastActivity.current=Date.now();
   if(Date.now()-lastActivity.current>=20*60*1000){setIdle(true);return;}
   if(lastActivity.current>lastSent.current&&Date.now()-lastSent.current>45000&&!inFlight.current){inFlight.current=true;void resume().finally(()=>{inFlight.current=false;});}
  },5000);
  return()=>{clearInterval(timer);events.forEach(event=>window.removeEventListener(event,activity));window.removeEventListener('message',message);};
 // The current run state must not reinitialize the inactivity timer on every render.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[projectId,previewUrl,iframeRef,running]);
 return {idle,error,resume};
}
