export const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const dayMs = 86400000;
export const dayOffset = (day, offset) => new Date(Date.parse(day+'T00:00:00Z') + offset*dayMs).toISOString().slice(0,10);
export const dayAt = (timestamp, zone) => new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(timestamp);
export const defaultShift = zone => ({zone, days:Object.fromEntries([1,2,3,4,5].map(day=>[day,{start:'09:00',end:'17:00'}]))});
const teamByType = {QC:'QC',Formatting:'DTP',Preflight:'DTP',Audio:'Audio',Braille:'Braille'};

export function shiftWindows(day, endDay, shift, timeZones, toInstant, viewerZone, leave=[]) {
 const viewerStart=Date.parse(toInstant(day+'T00:00',viewerZone));
 const viewerEnd=Date.parse(toInstant(endDay+'T00:00',viewerZone));
 const shiftZone=timeZones[shift.zone];
 const first=dayOffset(dayAt(viewerStart,shiftZone),-1);
 const last=dayAt(viewerEnd-1,shiftZone);
 const intervals=[];
 for(let current=first;current<=last;current=dayOffset(current,1)){
  const index=new Date(current+'T00:00Z').getUTCDay();
  const hours=shift.days[index];
  if(!hours)continue;
  const end=hours.end<hours.start?dayOffset(current,1):current;
  const startMs=shiftInstant(current,hours.start,shift.zone,toInstant);
  const endMs=shiftInstant(end,hours.end,shift.zone,toInstant);
  const overlap=clip(startMs,endMs,viewerStart,viewerEnd);
  if(overlap)intervals.push(overlap);
 }
 return unavailableWindows(leave,toInstant,viewerStart,viewerEnd).reduce((remaining,{start,end})=>
  remaining.flatMap(([left,right])=>[clip(left,right,left,start),clip(left,right,end,right)].filter(Boolean)),intervals);
}

export function unavailableWindows(leave,toInstant,from,through){
 return leave.flatMap(item=>{
  const start=Date.parse(toInstant(item.from+'T00:00',item.zone));
  const end=Date.parse(toInstant(dayOffset(item.to,1)+'T00:00',item.zone));
  const overlap=clip(start,end,from,through);
  return overlap?[{start:overlap[0],end:overlap[1],reason:item.reason}]:[];
 });
}

export function reportPeriod(day,mode,customEnd=day){
 if(mode==='Range')return [day,dayOffset(customEnd<day?day:customEnd,1)];
 if(mode==='Week'){
  const weekday=new Date(day+'T00:00Z').getUTCDay();
  const start=dayOffset(day,-((weekday+6)%7));
  return [start,dayOffset(start,7)];
 }
 if(mode==='Month'){
  const next=new Date(day.slice(0,7)+'-01T00:00Z');
  next.setUTCMonth(next.getUTCMonth()+1);
  return [day.slice(0,7)+'-01',next.toISOString().slice(0,10)];
 }
 return [day,dayOffset(day,1)];
}

function shiftInstant(day,time,zone,toInstant){
 const first=Date.parse(day+'T'+time+'Z');
 for(let minutes=0;minutes<=180;minutes++){
  const local=new Date(first+minutes*60000).toISOString().slice(0,16);
  const utc=toInstant(local,zone);
  if(utc)return Date.parse(utc);
 }
 return NaN;
}

function clip(start,end,from,through){
 const left=Math.max(start,from),right=Math.min(end,through);
 return left<right?[left,right]:null;
}

function unionMinutes(intervals){
 let total=0,end=-Infinity;
 for(const [start,finish] of [...intervals].sort((a,b)=>a[0]-b[0])){
  total+=Math.max(0,finish-Math.max(start,end));
  end=Math.max(end,finish);
 }
 return total/60000;
}

export const isCancelled = (task,statuses) => [task.status,statuses.find(status=>status.id===task.status)?.label]
 .some(value=>/\bcancell?ed\b/i.test(value??''));

export function workEvents(tasks,timers,statuses,now,archivedFiles){
 const parents=new Set(tasks.map(task=>task.parentTask).filter(Boolean));
 const active=new Map(timers.map(timer=>[timer.id,timer]));
 const phase=new Map(statuses.map(status=>[status.id,status.group]));
 return tasks.flatMap(task=>{
  if(isCancelled(task,statuses))return [];
  const completed=phase.get(task.status)==='Complete';
  const sessions=(task.sessions??[]).filter(session=>session.operator||task.person);
  const events=sessions.map(session=>({kind:'actual',task,member:session.operator||task.person,
   start:session.startedAt,end:session.endedAt,detail:session.closedWith}));
  const timer=active.get(task.id);
  if(timer)events.push({kind:'actual',task,member:timer.operator||task.person,start:timer.started,end:now,detail:'Running'});
  const ending=[...sessions].reverse().find(session=>session.closedWith==='Completed');
  const historicalEnd=sessions.reduce((latest,session)=>Math.max(latest,session.endedAt??0),0);
  const completeAt=task.completedAt??ending?.endedAt??(historicalEnd||new Date(task.modifiedAt??NaN).getTime());
  const completedBy=task.completedBy||ending?.operator||task.person;
  if(!parents.has(task.id)&&completed&&completedBy&&Number.isFinite(completeAt)){
   events.push({kind:'completed',task,member:completedBy,start:completeAt,end:completeAt});
  }
  if(!parents.has(task.id)&&task.person&&!completed&&!archivedFiles.has(task.fileId)&&
     Number.isFinite(task.scheduledStart)&&Number.isFinite(task.scheduledEnd)&&task.scheduledEnd>task.scheduledStart){
   events.push({kind:'scheduled',task,member:task.person,start:task.scheduledStart,end:task.scheduledEnd});
  }
  return events;
 });
}

export function memberMetrics(members,groups,events,windows,from,through,team=''){
 return members.map(name=>{
  const memberships=groups.filter(group=>group.members.includes(name));
  const shifts=windows[name]??[];
  const rows=events.filter(event=>{
   const point=event.kind==='completed';
   const inRange=point?event.start>=from&&event.start<through:event.end>from&&event.start<through;
   if(event.member!==name||!inRange)return false;
   if(!event.task)return !team||memberships.some(group=>group.team===team);
   const preferred=memberships.find(group=>group.team===teamByType[event.task.type])??memberships[0];
   return !team||preferred?.team===team;
  }).sort((a,b)=>a.start-b.start);
  const periods=kind=>rows.filter(row=>row.kind===kind).map(row=>[row.start,row.end]);
  const duringShift=kind=>unionMinutes(periods(kind).flatMap(([start,end])=>
   shifts.map(([left,right])=>clip(start,end,left,right)).filter(Boolean)));
  const count=kind=>new Set(rows.filter(row=>row.kind===kind).map(row=>row.task.id)).size;
  return {name,shifts,rows,completed:count('completed'),scheduled:count('scheduled'),
   worked:unionMinutes(periods('actual').map(([start,end])=>clip(start,end,from,through)).filter(Boolean)),
   capacity:unionMinutes(shifts),used:duringShift('actual'),planned:duringShift('scheduled')};
 });
}
