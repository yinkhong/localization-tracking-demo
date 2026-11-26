import {estimate,zones} from './data.js';
import {dayAt,dayOffset,isCancelled,shiftWindows} from './productivity-data.js';
import {dependencyIds} from './status.jsx';

const minute=60000;
const horizonDays=30;
const time=value=>value==null?NaN:new Date(value).getTime();
function anchoredBooking(task,minutes){
 const hasStart=Number.isFinite(task.scheduledStart);
 const hasEnd=Number.isFinite(task.scheduledEnd);
 if(hasStart&&hasEnd&&task.scheduledEnd>task.scheduledStart){
  return {start:task.scheduledStart,end:task.scheduledEnd,source:'Fixed'};
 }
 if(hasStart===hasEnd||!Number.isFinite(minutes)||minutes<=0)return null;
 const duration=minutes*minute;
 return hasStart?{start:task.scheduledStart,end:task.scheduledStart+duration,source:'Estimated end'}:
  {start:task.scheduledEnd-duration,end:task.scheduledEnd,source:'Estimated start'};
}

function reserve(windows,start,end){
 return windows.flatMap(([left,right])=>{
  if(end<=left||start>=right)return [[left,right]];
  return [[left,Math.min(start,right)],[Math.max(left,end),right]].filter(([a,b])=>a<b);
 });
}

function specificDeadline(task,shift,toInstant){
 const due=time(task.due);
 if(!Number.isFinite(due))return Infinity;
 const zone=zones[shift.zone];
 const day=dayAt(due,zone);
 const clock=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(due);
 const dayHours=key=>shift.days[new Date(key+'T00:00Z').getUTCDay()];
 const hours=dayHours(day),prior=dayOffset(day,-1),overnight=dayHours(prior);
 const shiftEnd=hours&&hours.end>hours.start?time(toInstant(day+'T'+hours.end,shift.zone)):NaN;
 const overnightEnd=overnight&&overnight.end<overnight.start?time(toInstant(day+'T'+overnight.end,shift.zone)):NaN;
 return clock==='23:59'||clock==='00:00'||due===shiftEnd||due===overnightEnd?Infinity:due;
}

function allocate(windows,duration,earliest,deadline=Infinity,latest=false){
 const available=windows.map(([start,end])=>[Math.max(start,earliest),Math.min(end,deadline)]).filter(([start,end])=>start<end);
 const ordered=latest?[...available].reverse():available;
 const blocks=[];
 for(const [start,end] of ordered){
  const length=Math.min(duration,end-start);
  blocks.push(latest?[end-length,end]:[start,start+length]);
  duration-=length;
  if(!duration)break;
 }
 return {blocks:latest?blocks.reverse():blocks,remaining:duration};
}

export function planWork({tasks,requests,statuses,shifts,leave,breakPlans,activeBreaks,timers,now,toInstant}){
 const accounts=new Map(requests.map(request=>[request.id,request.account]));
 const phase=new Map(statuses.map(status=>[status.id,status.group]));
 const byId=new Map(tasks.map(task=>[task.id,task]));
 const children=new Map();
 for(const task of tasks){
  if(task.parentTask)children.set(task.parentTask,[...(children.get(task.parentTask)??[]),task.id]);
 }
 const open=task=>phase.get(task.status)!=='Complete'&&!isCancelled(task,statuses);
 const pending=tasks.filter(task=>open(task)&&!children.has(task.id)&&task.person);
 const byMember=new Map();
 const issues=[];
 const entries=[];
 const finish=new Map();
 const running=new Map(timers.map(timer=>[timer.id,timer]));
 const effort=task=>estimate(accounts.get(task.request),task.type,task.pages).minutes;
 const bookings=new Map();
 for(const task of pending){
  const booking=anchoredBooking(task,effort(task));
  if(booking)bookings.set(task.id,booking);
  else if(Number.isFinite(task.scheduledStart)!==Number.isFinite(task.scheduledEnd)){
   issues.push({task,reason:'An effort estimate is needed to calculate the missing schedule time'});
   finish.set(task.id,null);
  }
 }
 const assigned=task=>time(task.assignedAt??task.createdAt)||0;
 for(const task of pending){
  if(!byMember.has(task.person))byMember.set(task.person,[]);
  byMember.get(task.person).push(task);
 }
 const available=new Map();
 for(const [person,assignedTasks] of byMember){
  const shift=shifts[person];
  if(!shift)continue;
  const first=dayAt(now,zones[shift.zone]);
  let windows=shiftWindows(first,dayOffset(first,horizonDays),shift,zones,toInstant,shift.zone,leave[person]??[])
   .map(([a,b])=>[Math.max(a,now),b]).filter(([a,b])=>a<b).sort(([a],[b])=>a-b);
  for(const {start,end} of breakPlans[person]??[])windows=reserve(windows,start,end);
  const activeBreak=activeBreaks[person];
  if(activeBreak)windows=reserve(windows,activeBreak.start,now+minute);
  const assignedBookings=assignedTasks.flatMap(task=>{
   const slot=bookings.get(task.id);
   return slot?[{task,operator:person,...slot}]:[];
  });
  const fixedBookings=assignedBookings.filter(slot=>slot.source==='Fixed');
  const clashes=new Set();
  for(const [index,slot] of fixedBookings.entries()){
   for(const other of fixedBookings.slice(index+1)){
    if(slot.start<other.end&&other.start<slot.end){
     clashes.add(slot.task.id);clashes.add(other.task.id);
    }
   }
  }
  for(const slot of assignedBookings){
   windows=reserve(windows,slot.start,slot.end);
   finish.set(slot.task.id,Math.max(now,slot.end));
   entries.push({...slot,conflict:clashes.has(slot.task.id)});
  }
  for(const task of assignedTasks){
   const timer=running.get(task.id);
   if(!timer)continue;
   const remaining=(effort(task)??0)*minute-(task.spent??0)*1000-Math.max(0,now-timer.started);
   const end=now+Math.max(minute,remaining);
   windows=reserve(windows,now,end);
   finish.set(task.id,Math.max(finish.get(task.id)??0,end));
  }
  available.set(person,windows);
 }
 const dependencies=new Map(tasks.map(task=>[task.id,dependencyIds(task,tasks)]));
 const required=new Map(tasks.map(task=>[task.id,[...dependencies.get(task.id),...(children.get(task.id)??[])]]));
 const importance=new Map();
 const prerequisiteOfUrgent=new Set();
 function prioritize(id,deadline){
  if(!byId.has(id)||!open(byId.get(id))||deadline>=(importance.get(id)??Infinity))return;
  importance.set(id,deadline);
  for(const prereq of required.get(id)??[]){
   prerequisiteOfUrgent.add(prereq);
   prioritize(prereq,deadline);
  }
 }
 for(const task of pending)if(!bookings.has(task.id)&&!finish.has(task.id)&&shifts[task.person])prioritize(task.id,specificDeadline(task,shifts[task.person],toInstant));
 const ordered=pending.filter(task=>!bookings.has(task.id)&&!finish.has(task.id)&&!running.has(task.id)).sort((a,b)=>
  (importance.get(a.id)??Infinity)-(importance.get(b.id)??Infinity)||assigned(a)-assigned(b)||a.id.localeCompare(b.id,'en',{numeric:true}));
 const visiting=new Set();
 function plan(id,asPrerequisite=false){
  const task=byId.get(id);
  if(!task)return null;
  if(!open(task))return now;
  if(finish.has(id))return finish.get(id);
  if(visiting.has(id))return null;
  visiting.add(id);
  const prerequisiteEnds=(required.get(id)??[]).map(prereq=>plan(prereq,true));
  let result=null;
  if(prerequisiteEnds.every(end=>end!=null)){
   const earliest=Math.max(now,...prerequisiteEnds);
   if(children.has(id))result=earliest;
   else if(task.person&&available.has(task.person)){
    const minutes=effort(task);
    if(!Number.isFinite(minutes))issues.push({task,reason:'Estimate unavailable'});
    else {
     const duration=Math.max(minute,Math.round(minutes*minute)-(task.spent??0)*1000);
     const windows=available.get(task.person);
     const deadline=importance.get(id)??Infinity;
     let allocation=allocate(windows,duration,earliest,deadline,Number.isFinite(deadline)&&!asPrerequisite&&!prerequisiteOfUrgent.has(id));
     if(allocation.remaining&&Number.isFinite(deadline))allocation=allocate(windows,duration,earliest);
     const {blocks,remaining}=allocation;
     for(const [start,end] of blocks){
      entries.push({task,operator:task.person,start,end,source:Number.isFinite(deadline)?'Deadline':'FIFO'});
      available.set(task.person,reserve(available.get(task.person),start,end));
     }
     if(remaining)issues.push({task,reason:'More work than available shift time'});
     else result=blocks.at(-1)?.[1]??null;
    }
   } else if(task.person)issues.push({task,reason:'No shift configured'});
  } else if(task.person)issues.push({task,reason:'Waiting for a prerequisite to be scheduled'});
  visiting.delete(id);
  finish.set(id,result);
  return result;
 }
 for(const task of ordered)plan(task.id);
 for(const task of pending){
  const due=time(task.due);
  if(bookings.get(task.id)?.source!=='Fixed'&&Number.isFinite(due)&&finish.get(task.id)>due)issues.push({task,reason:'Estimated finish is after the due time'});
 }
 return {entries:entries.sort((a,b)=>a.start-b.start),issues};
}

export function scheduleLabel(source){
 return source==='Deadline'?'Auto · deadline':source==='FIFO'?'Auto · FIFO':source;
}
