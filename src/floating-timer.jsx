import React, {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import styles from './floating-timer.css?raw';

export function FloatingTimer({taskId,taskName,type,started,spent,clock,pause,complete}){
 const [mount,setMount]=useState(null);
 const [inPage,setInPage]=useState(false);
 const windowRef=useRef(null);
 const opening=useRef(false);
 const disposed=useRef(false);
 const trigger=useRef(null);

 useEffect(()=>{
  disposed.current=false;
  return ()=>{
   disposed.current=true;
   windowRef.current?.close();
   windowRef.current=null;
  };
 },[]);

 async function open(){
  if(opening.current||windowRef.current||inPage)return;
  const pictureInPicture=window.documentPictureInPicture;
  if(!pictureInPicture){
   setInPage(true);
   return;
  }
  opening.current=true;
  let popup;
  try{
   popup=await pictureInPicture.requestWindow({width:330,height:200});
   if(disposed.current){popup.close();return;}
   windowRef.current=popup;
   const document=popup.document;
   document.title='Task timer';
   document.documentElement.lang='en';
   document.body.className='work-timer-window';
   const target=document.createElement('div');
   document.body.append(target);
   popup.addEventListener('pagehide',()=>{
    if(windowRef.current!==popup)return;
    windowRef.current=null;
    if(!disposed.current)setMount(null);
   },{once:true});
   setMount(target);
  }catch{
   popup?.close();
   if(!disposed.current)setInPage(true);
  }finally{
   opening.current=false;
  }
 }

 const dismiss=inPage?()=>{
  setInPage(false);
  requestAnimationFrame(()=>trigger.current?.focus());
 }:undefined;

 return <>
  <button ref={trigger} type="button" onClick={open} disabled={Boolean(mount)||inPage}
   aria-expanded={Boolean(mount)||inPage}>Float timer</button>
  {mount&&createPortal(<TimerCard {...{taskId,taskName,type,started,spent,clock,pause,complete}} timerWindow={mount.ownerDocument.defaultView}/>,mount)}
  {inPage&&<TimerCard {...{taskId,taskName,type,started,spent,clock,pause,complete,dismiss}} timerWindow={window}/>}
 </>;
}

function TimerCard({taskId,taskName,type,started,spent,clock,pause,complete,dismiss,timerWindow}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  const timer=timerWindow.setInterval(()=>setNow(Date.now()),250);
  return ()=>timerWindow.clearInterval(timer);
 },[timerWindow]);
 const seconds=spent+Math.max(0,Math.floor((now-started)/1000));
 return <section className={'work-timer-card'+(dismiss?' work-timer-in-page':'')} aria-label="Floating task timer">
  <style>{styles}</style>
  <header className="work-timer-header">
   <span>{dismiss?'Task timer · This tab':'Task timer'}</span>
   {dismiss&&<button type="button" onClick={dismiss} className="work-timer-dismiss" aria-label="Hide floating timer">×</button>}
  </header>
  <strong className="work-timer-task" title={taskName}>{taskName}</strong>
  <div className="work-timer-meta">{type} · {taskId}</div>
  <div className="work-timer-bottom">
   <output aria-label="Elapsed task time" aria-live="off">{clock(seconds)}</output>
   <div className="work-timer-actions">
    <button type="button" onClick={pause}>Pause</button>
    <button type="button" className="work-timer-complete" onClick={complete}>Complete</button>
   </div>
  </div>
 </section>;
}
