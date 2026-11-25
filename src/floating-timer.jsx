import React, {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import styles from './floating-timer.css?raw';

export function useFloatingTimer(timer,clock){
 const [surface,setSurface]=useState(null);
 const request=useRef(null);
 const key=timer?.key;

 function close(entry=request.current){
  if(!entry||request.current!==entry)return;
  request.current=null;
  entry.popup?.close();
  setSurface(null);
 }
 useLayoutEffect(()=>{
  if(request.current&&request.current.key!==key)close();
 },[key]);
 useEffect(()=>()=>{const entry=request.current;request.current=null;entry?.popup?.close();},[]);

 // Call from the Start or Float button handler so the browser can use that click's activation.
 async function open(key,title){
  if(request.current?.key===key)return;
  close();
  const entry={key};
  request.current=entry;
  try{
   const pictureInPicture=window.documentPictureInPicture;
   if(pictureInPicture){
    const popup=await pictureInPicture.requestWindow({width:330,height:title==='Task timer'?245:200});
    if(request.current!==entry){popup.close();return;}
    entry.popup=popup;
    const document=popup.document;
    document.title=title;
    document.documentElement.lang='en';
    document.body.className='work-timer-window';
    const mount=document.createElement('div');
    document.body.append(mount);
    popup.addEventListener('pagehide',()=>{
     if(request.current!==entry)return;
     request.current=null;
     setSurface(null);
    },{once:true});
    setSurface({key,mount});
    return;
   }
  }catch{
   entry.popup?.close();
   entry.popup=null;
  }
  if(request.current===entry)setSurface({key,mount:null});
 }
 const visible=Boolean(timer&&surface?.key===key);
 const control=timer&&<button type="button" disabled={visible} aria-expanded={visible}
  onClick={()=>open(key,timer.title)}>Float timer</button>;
 const content=visible&&<TimerCard timer={timer} clock={clock} dismiss={surface.mount?undefined:()=>close()}
  timerWindow={surface.mount?.ownerDocument.defaultView??window}/>;
 return {open,control,card:content&&surface.mount?createPortal(content,surface.mount):content};
}

function TimerCard({timer,clock,dismiss,timerWindow}){
 const [now,setNow]=useState(Date.now);
 useEffect(()=>{
  const interval=timerWindow.setInterval(()=>setNow(Date.now()),250);
  return ()=>timerWindow.clearInterval(interval);
 },[timerWindow]);
 const seconds=timer.spent+Math.max(0,Math.floor((now-timer.started)/1000));
 const overdue=Number.isFinite(timer.deadline)&&now>timer.deadline;
 const pastPlan=Number.isFinite(timer.plannedFinish)&&now>timer.plannedFinish||
  Number.isFinite(timer.plannedSeconds)&&seconds>timer.plannedSeconds;
 const warning=overdue?'Past deadline':pastPlan?'Past planned time':'';
 return <section className={'work-timer-card'+(dismiss?' work-timer-in-page':'')+(warning?' work-timer-warning':'')}
  aria-label={'Floating '+timer.title.toLowerCase()}>
  <style>{styles}</style>
  <header className="work-timer-header">
   <span>{timer.title}{dismiss&&' · This tab'}</span>
   {dismiss&&<button type="button" onClick={dismiss} className="work-timer-dismiss" aria-label="Hide floating timer">×</button>}
  </header>
  <strong className="work-timer-task" title={timer.name}>{timer.name}</strong>
  {timer.detail&&<div className="work-timer-meta">{timer.detail}</div>}
  {timer.deadlineLabel&&<div className="work-timer-meta">Deadline <strong>{timer.deadlineLabel}</strong></div>}
  {timer.plannedFinishLabel&&<div className="work-timer-meta">Planned finish <strong>{timer.plannedFinishLabel}</strong></div>}
  {timer.plannedSeconds!=null&&<div className="work-timer-meta">Planned effort <strong>{clock(timer.plannedSeconds)}</strong></div>}
  {warning&&<strong className="work-timer-alert" role="status">{warning}</strong>}
  <div className="work-timer-bottom">
   <output aria-label={timer.elapsedLabel} aria-live="off">{clock(seconds)}</output>
   <div className="work-timer-actions">
    {timer.pause&&<button type="button" onClick={timer.pause}>Pause</button>}
    <button type="button" className="work-timer-complete" onClick={timer.finish}>{timer.finishLabel}</button>
   </div>
  </div>
 </section>;
}
