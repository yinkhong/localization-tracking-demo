import {statusGroup} from './status';
import React, {useState} from 'react';
import {zones} from './data';
import {formatZoned} from './time-zone';

export const timelineRoles = ['Manager', 'PM', 'Team lead', 'Operator'];
export const defaultTimelineAccess = {'Manager': true, 'PM': true, 'Team lead': true, 'Operator': false};
export const groups = [
 {team:'DTP', name:'Preflight', members:['Jordan']},
 {team:'DTP', name:'Formatting', members:['Alex']},
 {team:'QC', name:'Review', members:['Alex','Taylor']},
 {team:'Audio', name:'Audio production', members:['Morgan']},
 {team:'Braille', name:'Braille production', members:['Taylor']},
];

export function audit(timestamp, creator, assigned = false) {
 return {createdAt:timestamp, createdBy:creator, assignedAt:assigned ? timestamp : null, modifiedAt:timestamp,modifiedBy:creator};
}
export function patchRecord(record, fields, timestamp, assigneeField) {
 const updated = {...record, ...fields, modifiedAt:timestamp};
 if (assigneeField && Object.hasOwn(fields, assigneeField) && fields[assigneeField] !== record[assigneeField]) {
  updated.assignedAt = fields[assigneeField] ? timestamp : null;
 }
 return updated;
}

const sampleAudit = audit('2026-11-20T17:00:00Z', 'Demo coordinator');
export function seedTimeline(tasks) {
 return tasks.map((task, index) => {
  const due = Date.parse(task.due);
  const planStart = due - (index % 3 + 2) * 3600000;
  const planEnd = planStart + 45 * 60000;
  const sessions = task.spent ? [{
   startedAt:planStart,
   endedAt:planStart + task.spent * 1000,
   operator:task.person,
   openedWith:'Started', sample:true,
   closedWith:task.status === 'Complete' ? 'Completed' : 'Paused',
  }] : [];
  return {...sampleAudit, ...task, assignedAt:task.person ? '2026-11-21T17:00:00Z' : null,
   scheduledStart:planStart, scheduledEnd:planEnd, sessions};
 });
}
export function bootstrapTimeline(state, isSample) {
 return {
  ...state,
  timelineAccess:state.timelineAccess ?? defaultTimelineAccess,
  requests:state.requests.map(r => isSample ? {...sampleAudit, ...r, assignedAt:sampleAudit.createdAt} : r),
  tasks:isSample ? seedTimeline(state.tasks) : state.tasks,
 };
}

export function Metadata({record, date}) {
 return <section className="panel"><div className="panel-header"><h2>Record history</h2></div>
  <dl className="audit-grid">
   <div><dt>Created</dt><dd>{date(record.createdAt)}</dd></div>
   <div><dt>Created by</dt><dd>{record.createdBy || '—'}</dd></div>
   <div><dt>Assigned</dt><dd>{date(record.assignedAt)}</dd></div>
   <div><dt>Last modified</dt><dd>{date(record.modifiedAt)}</dd></div>
   <div><dt>Last modified by</dt><dd>{record.modifiedBy || '—'}</dd></div>
  </dl></section>;
}

export function taskSessions(task, active) {
 const saved = task.sessions ?? [];
 const running=Array.isArray(active)?active.find(timer=>timer.id===task.id):active;
 return running?.id === task.id ? [...saved, {
  startedAt:running.started, endedAt:null, operator:running.operator ?? task.person,
  openedWith:running.openedWith ?? 'Started', closedWith:null,
 }] : saved;
}

export function SessionList({task, active, date, clock, now,children}) {
 const sessions = taskSessions(task, active);
 return <section className="panel"><div className="panel-header"><h2>Work sessions</h2></div>
  {sessions.length ? <div className="table-wrap"><table>
   <thead><tr><th>Operator</th><th>Start</th><th>End</th><th>Active time</th></tr></thead>
   <tbody>{sessions.map((item, index) => <tr key={index}>
    <td>{item.operator || '—'}{item.correction&&<small>Corrected by {item.correction.actor} · {date(item.correction.at)} · {item.correction.reason}</small>}</td><td>{date(item.startedAt)}<small>{item.openedWith}</small></td>
    <td>{item.endedAt ? date(item.endedAt) : '—'}<small>{item.closedWith || 'Running'}</small></td>
    <td>{clock(Math.max(0, Math.floor(((item.endedAt ?? now) - item.startedAt) / 1000)))}</td>
   </tr>)}</tbody>
  </table></div> : <p className="empty">No timed sessions recorded.</p>}
  {children}
 </section>;
}

function localDay(timestamp, zone) {
 const parts = new Intl.DateTimeFormat('en-CA',{timeZone:zones[zone],year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(timestamp);
 const byType=Object.fromEntries(parts.map(p=>[p.type,p.value]));
 return [byType.year,byType.month,byType.day].join('-');
}

function hourLabel(timestamp, zone) {
 return formatZoned(timestamp,zone,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
}

function timelineItems(tasks, active, now, includePlan, statuses) {
 return tasks.flatMap(task => {
  const entries = taskSessions(task, active).map(session => ({...session, task,
   end:session.endedAt ?? Math.max(now, session.startedAt),
   style:session.closedWith==='Completed' ? 'complete' : session.endedAt ? 'worked' : 'running',
   label:session.closedWith || 'Running',
  }));
  if (includePlan && task.person && statusGroup(statuses,task.status)!=='Complete') {
   const start=task.scheduledStart ?? Date.parse(task.due);
   if (Number.isFinite(start)) entries.push({task, operator:task.person, startedAt:start,
    end:task.scheduledEnd ?? start, endedAt:task.scheduledEnd ?? start, style:'planned',
    label:task.scheduledStart ? 'Scheduled' : 'Assigned · due'});
  }
  return entries;
 });
}

export function ResourceTimeline({tasks, active, now, zone, date, navigate, toInstant, person,statuses,typeLabel=id=>id,groups:roster=groups}) {
 const teams = [...new Set(roster.map(g => g.team))];
 const [team, setTeam] = useState('All teams');
 const [day, setDay] = useState(() => {
  const sessions = timelineItems(tasks, active, now, false,statuses).filter(entry => person && entry.operator===person);
  const liveSessions = sessions.filter(entry => !entry.sample);
  const latest = Math.max(0, ...(liveSessions.length ? liveSessions : sessions).map(entry => entry.startedAt));
  return localDay(person && latest ? latest : person ? Date.now() : Date.parse('2026-11-24T18:00:00Z'), zone);
 });
 const followingDay=day && new Date(Date.parse(day+'T12:00:00Z') + 86400000).toISOString().slice(0,10);
 const dayStart=day && Date.parse(toInstant(day+'T00:00',zone));
 const dayEnd=followingDay && Date.parse(toInstant(followingDay+'T00:00',zone));
 const dayLength=dayEnd-dayStart;
 const entries=timelineItems(tasks,active,now,!person,statuses);
 const members = person ? [{name:'',team:'',members:[person]}] : roster.filter(g => (team==='All teams' || g.team===team) && (g.kind!=='team'||g.members.length));
 const dayEntries=entries.filter(e => e.startedAt < dayEnd && (e.end > dayStart || e.startedAt >= dayStart));
 return <section className="panel resource">
  <div className="panel-header filters"><div><h2>{person ? 'Work timeline' : 'Team resources'}</h2>
   <p>{person ? 'Each uninterrupted period of work appears as a separate session.' : 'Scheduled work, due milestones, and work sessions by team and subteam.'}</p></div>
   <div className="timeline-controls">{!person&&<label>Team <select value={team} onChange={e=>setTeam(e.target.value)}>
    {['All teams',...teams].map(name=><option key={name}>{name}</option>)}</select></label>}
    <label>Day <input type="date" value={day} onChange={e=>setDay(e.target.value)}/></label>
    <button onClick={()=>setDay(localDay(Date.now(), zone))}>Today</button></div></div>
  <div className="timeline-legend">{[[!person&&'Scheduled / due','planned'],['Paused session','worked'],['Completed session','complete'],['Running','running']].filter(([label])=>label).map(([label,style])=><span key={style}><i className={style}/>{label}</span>)}</div>
  {dayLength>0 && <div className="timeline-scroll">
   <div className="resource-grid">
    <div className="resource-axis"><span>Operator</span><div>{[0,.25,.5,.75].map(fraction =>
     <span key={fraction} style={{left:fraction*100+'%'}}>{hourLabel(dayStart+dayLength*fraction,zone)}</span>)}</div></div>
    {members.map(group=><React.Fragment key={group.team+group.name}>
     {!person&&<h3>{group.team} / {group.name}</h3>}
     {group.members.map(member=>{
      const memberEntries=dayEntries.filter(e=>{
       if (e.operator!==member) return false;
       if (person) return true;
       const preferred=e.task.type==='QC'?'QC':e.task.type==='Audio'?'Audio':e.task.type==='Braille'?'Braille':'DTP';
       const available=roster.filter(g=>g.members.includes(member));
       const match=available.find(g=>g.team===preferred) ?? available[0];
       return group===match;
      }).sort((a,b)=>a.startedAt-b.startedAt);
      return <div className="resource-member" key={member}><strong>{member}</strong>
       <div className="resource-lanes">{memberEntries.length ? memberEntries.map((e,index)=>{
        const start=Math.max(dayStart,e.startedAt);
        const left=(start-dayStart)/dayLength*100;
        const width=(Math.min(dayEnd,e.end)-start)/dayLength*100;
        const label=[typeLabel(e.task.type),e.task.file,e.label,date(e.startedAt),e.endedAt!==e.startedAt&&e.endedAt?date(e.endedAt):null].filter(Boolean).join(' · ');
        return <div className="resource-lane" key={e.task.id+'-'+index}>
         <button className={'timeline-block '+e.style} style={{left:Math.min(left,99)+'%',width:Math.max(1, width)+'%'}}
          title={label} aria-label={label} onClick={()=>navigate('Task',e.task.id)} />
         <button className="link lane-caption" onClick={()=>navigate('Task',e.task.id)}>{label}</button>
        </div>;
       }) : <div className="resource-lane no-work">No work on this day</div>}</div>
      </div>;
     })}
    </React.Fragment>)}
   </div>
  </div>}
 </section>;
}

export function TimelineAdmin({access, onChange, title='Team resource access', description='Choose which roles can see other operators’ schedules and work sessions.'}) {
 return <section className="panel"><div className="panel-header"><div><h2>{title}</h2>
  <p>{description}</p></div></div>
  <div className="role-permissions">{timelineRoles.map(role=><label key={role}>
   <input type="checkbox" checked={Boolean(access[role])} onChange={e=>onChange(role,e.target.checked)}/>
   <span>{role}</span></label>)}</div>
 </section>;
}
