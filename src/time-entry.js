import {zones} from './data.js';
import {dayAt,dayOffset} from './productivity-data.js';

export const defaultCorrectionAccess={Manager:true,PM:false,'Team lead':false,Operator:false};
const overlaps=(start,end,otherStart,otherEnd)=>start<otherEnd&&end>otherStart;
const duration=session=>Math.max(0,Math.floor((session.endedAt-session.startedAt)/1000));

export function correctTaskTime(state,id,{selection,operator,start,end,reason},actor,now){
 const role=state.profiles[actor]?.role;
 if(!(state.correctionAccess??defaultCorrectionAccess)[role])return {error:'This role cannot correct task time.'};
 const task=state.tasks.find(task=>task.id===id);
 if(!task||state.workflowFiles.some(file=>file.id===task.fileId&&file.archivedAt)||state.tasks.some(item=>item.parentTask===id))
  return {error:'Select an active workflow task without subtasks.'};
 const sessions=task.sessions??[];
 const index=selection==='new'||selection==='running'?-1:Number(selection);
 const prior=sessions[index];
 const runningEntry=selection==='running'?Object.entries(state.activeTimers).find(([,timer])=>timer.id===id):null;
 if(selection==='running'&&!runningEntry||index!==-1&&!prior)return {error:'That work session is no longer available.'};
 const name=runningEntry?.[1].operator??runningEntry?.[0]??prior?.operator??operator;
 if(!Object.hasOwn(state.profiles,name)||!reason.trim()||!Number.isFinite(start)||!Number.isFinite(end)||end<=start||end>now)
  return {error:'Enter an operator, a reason, and start and end times in the past. The end must follow the start.'};
 const intersects=(left,right)=>overlaps(start,end,left,right);
 const workOverlap=state.tasks.some(item=>(item.sessions??[]).some((session,i)=>
  (item.id!==id||i!==index)&&(session.operator||item.person)===name&&intersects(session.startedAt,session.endedAt)));
 const timerOverlap=Object.entries(state.activeTimers).some(([person,timer])=>
  person!==runningEntry?.[0]&&(timer.operator||person)===name&&intersects(timer.started,now));
 const breaks=state.breakLogs?.[name]??[];
 const activeBreak=state.activeBreaks?.[name];
 if(workOverlap||timerOverlap||breaks.some(item=>intersects(item.start,item.end))||activeBreak&&intersects(activeBreak.start,now))
  return {error:'These times overlap recorded or running work or a break for this operator.'};
 const session={...prior,operator:name,startedAt:start,endedAt:end,openedWith:prior?.openedWith??'Manual entry',
  closedWith:prior?.closedWith??'Manual close',correction:{reason:reason.trim(),actor,at:now}};
 const nextSessions=index===-1?[...sessions,session]:sessions.map((item,i)=>i===index?session:item);
 const activeTimers={...state.activeTimers};
 if(runningEntry)delete activeTimers[runningEntry[0]];
 const corrected={...task,sessions:nextSessions,spent:Math.max(0,(task.spent??0)-(prior?duration(prior):0)+duration(session)),
  modifiedAt:now,...(runningEntry?{status:'Paused'}:{}),...(prior?.closedWith==='Completed'&&task.completedAt?{completedAt:end}:{} )};
 return {state:{...state,activeTimers,tasks:state.tasks.map(item=>item.id===id?corrected:item)}};
}

export function planBreak(plans,start,end,now){
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<now||end<=start)
  return 'Enter a future start time and an end time after it.';
 if(plans.some(item=>overlaps(start,end,item.start,item.end)))return 'That booking overlaps another planned break.';
 return '';
}

export function todayBreaks(logs,now,zone,toInstant){
 const day=dayAt(now,zones[zone]);
 const midnight=value=>Date.parse(toInstant(value+'T00:00',zone));
 const from=midnight(day),through=midnight(dayOffset(day,1));
 const entries=logs.flatMap(item=>{
  const start=Math.max(item.start,from),end=Math.min(item.end,through);
  if(start>=end)return [];
  return [{...item,start,end}];
 }).sort((a,b)=>b.start-a.start);
 const seconds=Math.floor(entries.reduce((sum,item)=>sum+item.end-item.start,0)/1000);
 return {entries,seconds};
}
