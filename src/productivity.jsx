import {scheduleLabel} from './auto-schedule';
import React, {useState} from 'react';
import {formatMinutes,zones} from './data';
import {formatZoned,zoneCode} from './time-zone';
import {dayAt,dayOffset,defaultShift,memberMetrics,reportPeriod,shiftWindows,weekdays,workEvents} from './productivity-data';
import {TeamWorkTimeline} from './team-work-timeline';

const rangeDay = (value,zone) => formatZoned(value,zone,{month:'short',day:'numeric',year:'numeric'});
const hours = minutes => formatMinutes(Math.round(minutes));
const percentage = (minutes,capacity) => capacity ? Math.round(100*minutes/capacity)+'%' : '—';
const namesForTeam = (groups,team) => [...new Set(groups.filter(group=>group.team===team).flatMap(group=>group.members))];
const metrics = ['completed','scheduled','worked','capacity','used','planned'];
const total = rows => Object.fromEntries(metrics.map(key=>[key,rows.reduce((sum,row)=>sum+row[key],0)]));

export function ShiftSettings({people,profiles,shifts,save,timeOff,updateTimeOff}){
 const [selection,setSelection]=useState(people[0]);
 const member=people.includes(selection)?selection:people[0];
 if(!member)return null;
 return <section className="panel"><div className="panel-header"><div><h2>Work shifts</h2>
  <p>Set recurring hours in the member’s work time zone. Leave a day unchecked for time off.</p></div>
  <label>Team member<select value={member} onChange={event=>setSelection(event.target.value)}>
   {people.map(name=><option key={name}>{name}</option>)}</select></label></div>
  <ShiftForm key={member} shift={shifts[member]??defaultShift(profiles[member].zone)} save={value=>save(member,value)}/>
  <TimeOff key={member+':leave'} zone={shifts[member]?.zone??profiles[member].zone} entries={timeOff[member]??[]}
   update={change=>updateTimeOff(member,change)}/>
 </section>;
}

function ShiftForm({shift,save}){
 const [days,setDays]=useState(shift.days),[zone,setZone]=useState(shift.zone);
 const [error,setError]=useState('');
 const change=(day,field,value)=>setDays(previous=>({...previous,[day]:{...previous[day],[field]:value}}));
 return <form className="shift-form" onSubmit={event=>{
  event.preventDefault();
  if(Object.values(days).some(day=>day?.start===day?.end&&day)){setError('Set different start and end times on each workday.');return;}
  setError('');save({zone,days:Object.fromEntries(Object.entries(days).filter(([,value])=>value))});
 }}>
  <label>Shift time zone<select value={zone} onChange={event=>setZone(event.target.value)}>
   {Object.entries(zones).map(([key,id])=><option key={key} value={key}>{id} ({zoneCode(key)})</option>)}</select></label>
  <div className="shift-days">{[1,2,3,4,5,6,0].map(day=><div className="shift-day" key={day}>
   <label><input type="checkbox" checked={Boolean(days[day])} onChange={event=>setDays({...days,[day]:event.target.checked?
    {start:'09:00',end:'17:00'}:null})}/>{weekdays[day]}</label>
   <input aria-label={weekdays[day]+' start'} type="time" value={days[day]?.start??''} required={Boolean(days[day])} disabled={!days[day]}
    onChange={event=>change(day,'start',event.target.value)}/>
   <input aria-label={weekdays[day]+' end'} type="time" value={days[day]?.end??''} required={Boolean(days[day])} disabled={!days[day]}
    onChange={event=>change(day,'end',event.target.value)}/>
  </div>)}</div>
  <p className="note">An end time earlier than the start time ends the following day.</p>
  {error&&<p className="error" role="alert">{error}</p>}
  <button className="primary">Save shift</button>
 </form>;
}

function TimeOff({zone,entries,update}){
 const [error,setError]=useState('');
 return <div className="time-off-settings">
  <h3>Time off</h3><p>Full days in the member’s shift time zone ({zoneCode(zone)}).</p>
  <form className="timeline-controls" onSubmit={event=>{
   event.preventDefault();
   const form=event.currentTarget;
   const {from,to,reason}=Object.fromEntries(new FormData(form));
   if(to<from){setError('The last day must be on or after the first day.');return;}
   const entry={id:crypto.randomUUID(),from,to,reason,zone};
   update(list=>[...list,entry]);setError('');form.reset();
  }}>
   <label>First day<input name="from" type="date" required/></label>
   <label>Last day<input name="to" type="date" required/></label>
   <label>Availability<select name="reason">{['PTO','Sick leave','Holiday','Unavailable'].map(reason=><option key={reason}>{reason}</option>)}</select></label>
   <button>Add time off</button>
  </form>
  {error&&<p className="error" role="alert">{error}</p>}
  {entries.length>0&&<ul>{[...entries].sort((a,b)=>a.from.localeCompare(b.from)).map(entry=>
   <li key={entry.id}><span>{entry.reason} · {entry.from}{entry.to!==entry.from&&' – '+entry.to} · {zoneCode(entry.zone,entry.from+'T12:00Z')}</span>
    <button aria-label={'Remove '+entry.reason+' starting '+entry.from} onClick={()=>update(list=>list.filter(item=>item.id!==entry.id))}>Remove</button></li>)}</ul>}
 </div>;
}

export function Productivity({workPlan,tasks,timers,statuses,now,teamGroups,profiles,shifts,zone,toInstant,navigate,typeLabel,archivedFiles,timeOff,breakPlans,breakLogs,activeBreaks}){
 const [day,setDay]=useState(()=>dayAt(now,zones[zone]));
 const [mode,setMode]=useState('Day'),[customEnd,setCustomEnd]=useState(day);
 const [team,setTeam]=useState(''),[member,setMember]=useState('');
 const teams=[...new Set(teamGroups.map(group=>group.team))];
 const roster=team?namesForTeam(teamGroups,team):Object.keys(profiles);
 const people=roster.filter(name=>!member||name===member);
 const [startDay,endDay]=reportPeriod(day,mode,customEnd);
 const from=Date.parse(toInstant(startDay+'T00:00',zone)),through=Date.parse(toInstant(endDay+'T00:00',zone));
 function movePeriod(direction){
  if(mode==='Month'){setDay(direction<0?dayOffset(startDay,-1):endDay);return;}
  const span=Math.round((Date.parse(endDay)-Date.parse(startDay))/86400000);
  setDay(dayOffset(day,direction*span));
  if(mode==='Range')setCustomEnd(dayOffset(dayOffset(endDay,-1),direction*span));
 }
 const windows=Object.fromEntries(Object.keys(profiles).map(name=>[name,
  shiftWindows(startDay,endDay,shifts[name]??defaultShift(profiles[name].zone),zones,toInstant,zone,timeOff[name])]));
 const events=workEvents(tasks,timers,statuses,now).concat((workPlan?.entries??[]).map(item=>({
  ...item,kind:'scheduled',member:item.operator,detail:item.conflict?'Fixed booking overlaps another fixed booking':
   scheduleLabel(item.source),
 })));
 for(const name of Object.keys(profiles)){
  const planned=(breakPlans[name]??[]).map(item=>({...item,kind:'plannedBreak',member:name}));
  const logged=(breakLogs[name]??[]).map(item=>({...item,kind:'actualBreak',member:name}));
  const active=activeBreaks[name];
  events.push(...planned,...logged);
  if(active)events.push({...active,kind:'actualBreak',member:name,end:now,detail:'Running'});
 }
 const individuals=memberMetrics(people,teamGroups,events,windows,from,through,team);
 const teamRows=(team?[team]:teams).map(name=>{
  const names=namesForTeam(teamGroups,name).filter(person=>!member||person===member);
  return {name,...total(memberMetrics(names,teamGroups,events,windows,from,through,name))};
 });
 const summary=total(individuals);
 const countScale=Math.max(1,...[...individuals,...teamRows].flatMap(row=>[row.completed,row.scheduled]));
 return <>
  <section className="panel"><div className="panel-header filters">
   <div className="timeline-controls">
    <div className="segments" aria-label="Reporting period">{[['Day','Daily'],['Week','Weekly'],['Month','Monthly'],['Range','Date range']].map(([id,label])=>
     <button key={id} aria-pressed={mode===id} onClick={()=>setMode(id)}>{label}</button>)}</div>
    <button aria-label="Previous reporting period" onClick={()=>movePeriod(-1)}>‹</button>
    <label>{mode==='Range'?'From':'Date'}<input type="date" value={day} onChange={event=>{
     if(event.target.value){setDay(event.target.value);if(event.target.value>customEnd)setCustomEnd(event.target.value);}
    }}/></label>
    {mode==='Range'&&<label>Through<input type="date" min={day} value={customEnd<day?day:customEnd} onChange={event=>{
     if(event.target.value>=day)setCustomEnd(event.target.value);
    }}/></label>}
    <button aria-label="Next reporting period" onClick={()=>movePeriod(1)}>›</button>
    <button onClick={()=>{const today=dayAt(Date.now(),zones[zone]);setDay(today);setCustomEnd(today);}}>Today</button>
    <label>Team<select value={team} onChange={event=>{setTeam(event.target.value);setMember('');}}>
     <option value="">All teams</option>{teams.map(name=><option key={name}>{name}</option>)}</select></label>
    <label>Team member<select value={member} onChange={event=>setMember(event.target.value)}>
     <option value="">All members</option>{roster.map(name=><option key={name}>{name}</option>)}</select></label>
   </div></div>
   <p className="productivity-note reporting-period">{rangeDay(from,zone)}{dayOffset(startDay,1)!==endDay&&' – '+rangeDay(through-1,zone)}</p>
   <div className="report-summary productivity-summary">
    {[
     ['Completed tasks',summary.completed],['Scheduled tasks',summary.scheduled],['Worked time',hours(summary.worked)],
     ['Shift capacity',hours(summary.capacity)],['Utilization',percentage(summary.used,summary.capacity)],['Scheduled load',percentage(summary.planned,summary.capacity)],
    ].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}
   </div>
   <p className="productivity-note">Utilization is tracked work within shift hours divided by shift capacity. Scheduled load uses open tasks with a saved schedule. Cancelled tasks are excluded.</p>
  </section>
  <section className="panel"><div className="panel-header"><h2>Productivity charts</h2></div>
   <div className="table-wrap"><table className="productivity-chart"><thead><tr><th scope="col">Team or member</th>
    <th scope="col">Completed tasks</th><th scope="col">Scheduled tasks</th><th scope="col">Worked time</th>
    <th scope="col">Shift capacity</th><th scope="col">Utilization</th><th scope="col">Scheduled load</th></tr></thead>
    {[['Teams',teamRows],['Members',individuals]].map(([label,rows])=><tbody key={label}><tr><th colSpan="7" scope="rowgroup">{label}</th></tr>
     {rows.map(row=><tr key={row.name}><th scope="row">{row.name}</th>
      {['completed','scheduled'].map(kind=><td key={kind}><ChartBar label={kind} value={row[kind]} max={countScale} text={row[kind]}/></td>)}
      <td>{hours(row.worked)}</td><td>{hours(row.capacity)}</td>
      {['used','planned'].map(kind=><td key={kind}><ChartBar label={kind==='used'?'Utilization':'Scheduled load'}
       value={row[kind]} max={row.capacity} text={percentage(row[kind],row.capacity)}/></td>)}
     </tr>)}</tbody>)}
   </table></div>
  </section>
  <TeamWorkTimeline {...{day,people,team,teamGroups,events,shifts,timeOff,zone,now,toInstant,typeLabel,navigate,archivedFiles}}/>
 </>;
}

function ChartBar({label,value,max,text}){
 return <div className="productivity-bar">{max>0&&<meter className={label} min={0} max={max} value={value} aria-label={label}/>}<span>{text}</span></div>;
}

