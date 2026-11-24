import React, {useState} from 'react';
import {formatMinutes,zones} from './data';
import {formatZoned,zoneCode} from './time-zone';
import {dayAt,dayOffset,defaultShift,memberMetrics,shiftWindows,weekdays,workEvents} from './productivity-data';

const time = (value,zone) => formatZoned(value,zone,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const hours = minutes => formatMinutes(Math.round(minutes));
const percentage = (minutes,capacity) => capacity ? Math.round(100*minutes/capacity)+'%' : '—';
const namesForTeam = (groups,team) => [...new Set(groups.filter(group=>group.team===team).flatMap(group=>group.members))];
const metrics = ['completed','scheduled','worked','capacity','used','planned'];
const total = rows => Object.fromEntries(metrics.map(key=>[key,rows.reduce((sum,row)=>sum+row[key],0)]));

export function ShiftSettings({people,profiles,shifts,save}){
 const [selection,setSelection]=useState(people[0]);
 const member=people.includes(selection)?selection:people[0];
 if(!member)return null;
 return <section className="panel"><div className="panel-header"><div><h2>Work shifts</h2>
  <p>Set recurring hours in the member’s work time zone. Leave a day unchecked for time off.</p></div>
  <label>Team member<select value={member} onChange={event=>setSelection(event.target.value)}>
   {people.map(name=><option key={name}>{name}</option>)}</select></label></div>
  <ShiftForm key={member} shift={shifts[member]??defaultShift(profiles[member].zone)} save={value=>save(member,value)}/>
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

export function Productivity({tasks,timers,statuses,now,teamGroups,profiles,shifts,zone,toInstant,navigate,typeLabel,archivedFiles}){
 const [day,setDay]=useState(()=>dayAt(now,zones[zone]));
 const [team,setTeam]=useState(''),[member,setMember]=useState('');
 const teams=[...new Set(teamGroups.map(group=>group.team))];
 const roster=team?namesForTeam(teamGroups,team):Object.keys(profiles);
 const people=roster.filter(name=>!member||name===member);
 const following=dayOffset(day,1),from=Date.parse(toInstant(day+'T00:00',zone)),through=Date.parse(toInstant(following+'T00:00',zone));
 const windows=Object.fromEntries(Object.keys(profiles).map(name=>[name,
  shiftWindows(day,following,shifts[name]??defaultShift(profiles[name].zone),zones,toInstant,zone)]));
 const events=workEvents(tasks,timers,statuses,now,archivedFiles);
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
    <button aria-label="Previous day" onClick={()=>setDay(dayOffset(day,-1))}>‹</button>
    <label>Day<input type="date" value={day} onChange={event=>{if(event.target.value)setDay(event.target.value);}}/></label>
    <button aria-label="Next day" onClick={()=>setDay(following)}>›</button>
    <button onClick={()=>setDay(dayAt(Date.now(),zones[zone]))}>Today</button>
    <label>Team<select value={team} onChange={event=>{setTeam(event.target.value);setMember('');}}>
     <option value="">All teams</option>{teams.map(name=><option key={name}>{name}</option>)}</select></label>
    <label>Team member<select value={member} onChange={event=>setMember(event.target.value)}>
     <option value="">All members</option>{roster.map(name=><option key={name}>{name}</option>)}</select></label>
   </div></div>
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
  <section className="panel"><div className="panel-header"><h2>Team work timeline</h2></div>
   <div className="timeline-legend">{[['Shift','shift'],['Scheduled','scheduled'],['Worked','actual'],['Completed','completed']].map(([label,kind])=>
    <span key={kind}><i className={'productivity-'+kind}/>{label}</span>)}</div>
   <div className="timeline-scroll"><div className="resource-grid">
    <div className="resource-axis"><span>Team member</span><div>{[0,.25,.50,.75].map(fraction=>
     <span key={fraction} style={{left:fraction*100+'%'}}>{time(from+(through-from)*fraction,zone)}</span>)}</div></div>
    {individuals.map(row=><div className="resource-member" key={row.name}><strong>{row.name}</strong>
     <div className="resource-lanes">
      <TimelineLane bars={row.shifts.map(([start,end])=>({start,end}))} kind="shift" from={from} through={through}
       caption={bar=>time(bar.start,zone)+' – '+time(bar.end,zone)} empty="Off shift"/>
      {row.rows.map((event,index)=><TimelineLane key={event.task.id+'-'+index} bars={[event]} kind={event.kind} from={from} through={through}
       caption={bar=>[typeLabel(bar.task.type),bar.task.file,time(bar.start,zone)+(bar.end>bar.start?' – '+time(bar.end,zone):''),bar.detail].filter(Boolean).join(' · ')}
       open={archivedFiles.has(event.task.fileId)?undefined:()=>navigate('Task',event.task.id)}/>)}
      {!row.rows.length&&<div className="resource-lane no-work">No work recorded or scheduled</div>}
     </div></div>)}
   </div></div>
  </section>
 </>;
}

function ChartBar({label,value,max,text}){
 return <div className="productivity-bar">{max>0&&<meter className={label} min={0} max={max} value={value} aria-label={label}/>}<span>{text}</span></div>;
}

function TimelineLane({bars,kind,from,through,caption,open,empty}){
 return <div className={'resource-lane productivity-lane '+(bars.length?'':'no-work')}>
  {bars.map((bar,index)=>{
   const left=Math.max(0,100*(bar.start-from)/(through-from));
   const end=Math.min(100,100*(bar.end-from)/(through-from));
   const style={left:Math.min(left,99)+'%',width:Math.max(end-left,1)+'%'};
   const label=caption(bar);
   return <React.Fragment key={index}>
    {open?<button className={'timeline-block productivity-'+kind} style={style} aria-label={label} title={label} onClick={open}/>:
     <span className={'timeline-block productivity-'+kind} style={style} title={label}/>}
   </React.Fragment>;
  })}
  <span className="productivity-caption"><strong>{{shift:'Shift',scheduled:'Scheduled',actual:'Worked',completed:'Completed'}[kind]}</strong>
   {bars.length?bars.map((bar,index)=>open?<button key={index} className="link" onClick={open}>{caption(bar)}</button>:
    <span key={index}>{caption(bar)}</span>):<span>{empty}</span>}</span>
 </div>;
}
