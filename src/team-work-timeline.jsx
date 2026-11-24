import React, {useLayoutEffect,useMemo,useRef,useState} from 'react';
import {zones} from './data';
import {formatZoned} from './time-zone';
import {dayAt,dayOffset,memberMetrics,shiftWindows,unavailableWindows} from './productivity-data';

const dayWidth=480;
const buffer=7;
const size=15;
const labelWidth=122;
const kinds={shift:'Shift',unavailable:'Unavailable',scheduled:'Scheduled',actual:'Worked',completed:'Completed'};
const time=(value,zone)=>formatZoned(value,zone,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const calendar=(value,zone)=>new Intl.DateTimeFormat('en-US',{timeZone:zones[zone],weekday:'short',month:'short',day:'numeric'}).format(value);
const labelFor=(event,zone,typeLabel)=>[
 kinds[event.kind],typeLabel(event.task.type),event.task.file,event.task.id,
 time(event.start,zone)+(event.end>event.start?' – '+time(event.end,zone):''),event.detail,
].filter(Boolean).join(' · ');

export function TeamWorkTimeline({day,people,team,teamGroups,events,shifts,timeOff,zone,now,toInstant,typeLabel,navigate,archivedFiles}){
 const [window,setWindow]=useState(()=>({day,at:null,revision:0}));
 const [visibleDay,setVisibleDay]=useState(day);
 const [focused,setFocused]=useState('');
 const pane=useRef(null);
 const lastDate=useRef(day);
 const member=people.includes(focused)?focused:'';
 const dates=useMemo(()=>Array.from({length:size+1},(_,index)=>{
  const key=dayOffset(window.day,index-buffer);
  return {key,start:Date.parse(toInstant(key+'T00:00',zone))};
 }),[window.day,zone,toInstant]);
 const leftDay=dates[0],rightDay=dates.at(-1);
 function position(value){
  if(value<=leftDay.start)return 0;
  if(value>=rightDay.start)return size*dayWidth;
  const index=dates.findIndex(date=>date.start>value)-1;
  return dayWidth*(index+(value-dates[index].start)/(dates[index+1].start-dates[index].start));
 }
 function jump(target,at=null){
  setVisibleDay(target);
  setWindow(previous=>({day:target,at,revision:previous.revision+1}));
 }
 useLayoutEffect(()=>{
  if(day===lastDate.current)return;
  lastDate.current=day;
  jump(day);
 },[day]);
 useLayoutEffect(()=>{
  const element=pane.current;
  if(!element)return;
  const available=element.clientWidth-labelWidth;
  const center=window.at==null?(buffer+.5)*dayWidth:position(window.at);
  element.scrollLeft=Math.max(0,center-available/2);
 },[window,zone]);
 function onScroll(){
  const element=pane.current;
  const center=element.scrollLeft+(element.clientWidth-labelWidth)/2;
  const index=Math.max(0,Math.min(size-1,Math.floor(center/dayWidth)));
  const day=dates[index].key;
  setVisibleDay(day);
  if(index<=1||index>=size-2){
   const fraction=center/dayWidth-index;
   jump(day,dates[index].start+fraction*(dates[index+1].start-dates[index].start));
  }
 }
 const showNow=now>=leftDay.start&&now<rightDay.start;
 const names=member?[member]:people;
 const windows=Object.fromEntries(names.map(name=>[name,shiftWindows(leftDay.key,rightDay.key,shifts[name],zones,toInstant,zone,timeOff[name])]));
 const rows=memberMetrics(names,teamGroups,events,windows,leftDay.start,rightDay.start,team);
 const focusedDay=dates.find(date=>date.key===visibleDay)??dates[buffer];
 const detailEnd=dates[dates.indexOf(focusedDay)+1].start;
 return <section className="panel team-timeline">
  <div className="panel-header filters">
   <div><h2>{member?member+'’s work timeline':'Team work timeline'}</h2>
    <p>{calendar(focusedDay.start,zone)} · {time(focusedDay.start,zone).split(' ').at(-1)}</p></div>
   <div className="timeline-controls">
    {member&&<button onClick={()=>setFocused('')}>Back to team</button>}
    <button aria-label="Previous timeline day" onClick={()=>jump(dayOffset(visibleDay,-1))}>‹</button>
    <button aria-label="Next timeline day" onClick={()=>jump(dayOffset(visibleDay,1))}>›</button>
    <button className="timeline-now-button" onClick={()=>{const instant=Date.now();jump(dayAt(instant,zones[zone]),instant);}}>Now</button>
   </div>
  </div>
  <div className="timeline-legend">{Object.entries(kinds).map(([kind,label])=>
   <span key={kind}><i className={'productivity-'+kind}/>{label}</span>)}</div>
  <div className="team-timeline-scroll" role="region" aria-label="Scrollable timeline" tabIndex="0" ref={pane} onScroll={onScroll}>
   <div className="team-timeline-grid" style={{'--timeline-day':dayWidth+'px','--timeline-name':labelWidth+'px',width:labelWidth+size*dayWidth}}>
    {showNow&&<div className="team-now-line" aria-label={'Current time '+time(now,zone)}
     style={{left:labelWidth+position(now)}}><span>{time(now,zone)}</span></div>}
    <div className="team-timeline-row team-timeline-axis">
     <div className="team-timeline-name">Member</div>
     <div className="team-timeline-track">{dates.slice(0,-1).map(({key,start},index)=>
      <div className="team-timeline-date" key={key} style={{left:index*dayWidth}}>
       <strong>{calendar(start,zone)}</strong>
       <div>{[0,.25,.5,.75].map(fraction=><span key={fraction} style={{left:(fraction*100)+'%'}}>
        {time(start+(dates[index+1].start-start)*fraction,zone).split(' ')[0]}</span>)}</div>
      </div>)}</div>
    </div>
    {rows.map(row=>{
     const absences=unavailableWindows(timeOff[row.name]??[],toInstant,leftDay.start,rightDay.start);
     return <div className="team-timeline-row" key={row.name}>
      <div className="team-timeline-name"><button className="link" aria-label={'Show timeline details for '+row.name}
       onClick={()=>setFocused(row.name)}>{row.name}</button></div>
      <div className="team-timeline-track">
       {absences.map((bar,index)=><div key={index} className="team-absence productivity-unavailable"
        style={{left:position(bar.start),width:position(bar.end)-position(bar.start)}} title={'Unavailable · '+bar.reason}>
        <span>Unavailable · {bar.reason}</span></div>)}
       {row.shifts.map(([start,end])=><span key={start} className="team-event productivity-shift"
        style={{left:position(start),width:position(end)-position(start)}} title={'Shift · '+time(start,zone)+' – '+time(end,zone)}/>)}
       {compactEvents(row.rows,position).map(group=>{
        const caption=group.events.map(event=>labelFor(event,zone,typeLabel)).join('\n');
        const task=group.events[0].task;
        return <button key={group.kind+':'+group.left} className={'team-event productivity-'+group.kind}
         style={{left:group.left,width:group.end-group.left}} title={caption} aria-label={caption}
         onClick={()=>{
          if(group.events.length===1&&!archivedFiles.has(task.fileId))navigate('Task',task.id);
          else setFocused(row.name);
         }}/>;
       })}
      </div>
     </div>;
    })}
   </div>
  </div>
  {member&&<TimelineDetails rows={rows[0].rows} shifts={rows[0].shifts}
   absences={unavailableWindows(timeOff[member]??[],toInstant,focusedDay.start,detailEnd)}
   from={focusedDay.start} through={detailEnd} {...{zone,typeLabel,navigate,archivedFiles}}/>}
 </section>;
}

function compactEvents(events,position){
 const groups=[];
 for(const kind of ['scheduled','actual','completed']){
  const bars=events.filter(event=>event.kind===kind).map(event=>{
   const left=Math.min(position(event.start),size*dayWidth-8);
   return {kind,left,end:Math.max(left+8,position(event.end)),events:[event]};
  }).sort((a,b)=>a.left-b.left);
  let previous;
  for(const bar of bars){
   if(previous&&bar.left<previous.end){
    previous.end=Math.max(previous.end,bar.end);
    previous.events.push(...bar.events);
   }else{
    groups.push(bar);
    previous=bar;
   }
  }
 }
 return groups;
}

function TimelineDetails({rows,shifts,absences,from,through,zone,typeLabel,navigate,archivedFiles}){
 const times=(start,end)=>time(start,zone)+(end>start?' – '+time(end,zone):'');
 const items=[
  ...shifts.map(([start,end])=>({kind:'shift',start,end})),
  ...absences.map(item=>({...item,kind:'unavailable',detail:item.reason})),
  ...rows,
 ].filter(item=>item.kind==='completed'?item.start>=from&&item.start<through:item.end>from&&item.start<through)
  .sort((a,b)=>a.start-b.start);
 return <div className="timeline-details">
  <h3>{calendar(from,zone)} details</h3>
  {items.length?<div className="table-wrap"><table><thead><tr><th>Type</th><th>Time</th><th>Task or availability</th></tr></thead>
   <tbody>{items.map((item,index)=><tr key={index}><td>{kinds[item.kind]}</td>
    <td>{times(Math.max(from,item.start),Math.min(through,item.end))}</td>
    <td>{item.task&&!archivedFiles.has(item.task.fileId)?
     <button className="link" onClick={()=>navigate('Task',item.task.id)}>{typeLabel(item.task.type)} · {item.task.file} · {item.task.id}</button>:
     item.task?typeLabel(item.task.type)+' · '+item.task.file:item.detail??'Working hours'}
     {item.task&&item.detail&&<small>{item.detail}</small>}</td></tr>)}</tbody></table></div>:
   <p className="empty">No shifts or tasks on this day.</p>}
 </div>;
}
