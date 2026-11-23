import {blockedTask, parentTaskIds, StatusPicker, statusGroup} from './status';
import React, {useState} from 'react';
import {estimate, formatMinutes, types} from './data';

export const demoProfiles = {
 Alex:{role:'Manager',zone:'Pacific'},
 Jordan:{role:'Team lead',zone:'Eastern'},
 Morgan:{role:'PM',zone:'London'},
 Taylor:{role:'Operator',zone:'India'},
};
export const defaultActivityAccess = {'Manager':true,'PM':true,'Team lead':true,'Operator':false};

export function bootstrapWorkflow(state) {
 const files = [...(state.workflowFiles ?? [])];
 const tasks = state.tasks.map(task => {
  if(task.fileId && files.some(file=>file.id===task.fileId)) return task;
  let file = files.find(item=>item.request===task.request&&item.name===task.file);
  if(!file){
   file={id:'file-'+task.id,request:task.request,name:task.file};
   files.push(file);
  }
  return {...task,fileId:file.id};
 });
 const legacy=state.active;
 const operator=legacy?.operator ?? tasks.find(task=>task.id===legacy?.id)?.person ?? 'Alex';
 const {active,zone,...saved}=state;
 return {...saved,tasks,workflowFiles:files,activity:state.activity??[],
  profile:Object.hasOwn(demoProfiles,state.profile)?state.profile:'Alex',
  profiles:state.profiles??{...demoProfiles,Alex:{...demoProfiles.Alex,zone:zone||'Pacific'}},
  activeTimers:state.activeTimers??(legacy?{[operator]:{...legacy,operator}}:{}),
  activityAccess:state.activityAccess??defaultActivityAccess,
 };
}

const trackedFields = {
 requests:['title','account','owner','status','risk','due','forecast','files','types','initialMinutes'],
 workflowFiles:['name'],
 tasks:['type','person','pages','status','due','scheduledStart','scheduledEnd','dependsOn','parentTask','spent'],
 defects:['title','severity','status','request','task','description','filePath','steps','rootCause','corrective','preventive','attachments'],
};
const recordNames = {requests:'Request',workflowFiles:'File',tasks:'Task',defects:'Defect'};
const fieldNames = {
 title:'Title',account:'Account',owner:'Project owner',person:'Assignee',type:'Task type',pages:'Pages',
 status:'Status',risk:'Delivery risk',due:'Due',forecast:'Forecast',files:'Planned files',types:'Task types',
 initialMinutes:'Estimated effort (min)',name:'File name',scheduledStart:'Scheduled start',
 scheduledEnd:'Scheduled end',dependsOn:'Predecessor',parentTask:'Parent task',spent:'Recorded work (sec)',
 severity:'Severity',request:'Related request',task:'Related task',description:'Incident summary',filePath:'File path',steps:'Steps & operators',rootCause:'Root cause',corrective:'Corrective actions',preventive:'Preventive actions',attachments:'Attachments',
 timer:'Timer started at',
};
const dateFields = ['due','forecast','scheduledStart','scheduledEnd','timer'];
function trackedValue(key,value) {
 return key==='attachments' ? value?.map(file=>file.name) : value==='' ? null : value??null;
}

export function withActivity(before, next, actor, timestamp, action) {
 if(next===before) return before;
 const entries = [];
 for(const [collection, fields] of Object.entries(trackedFields)) {
  if(next[collection]===before[collection]) continue;
  const previous = new Map(before[collection].map(record=>[record.id,record]));
  for(const record of next[collection]) {
   const old=previous.get(record.id);
   if(record===old) continue;
   const changes=fields.flatMap(key=>{
    const from=trackedValue(key,old?.[key]),to=trackedValue(key,record[key]);
    if(JSON.stringify(from)===JSON.stringify(to))return [];
    if(key==='status'&&collection!=='defects'){
     const name=(value,list)=>list?.find(status=>status.id===value)?.label??value;
     return [{key,from:name(from,before.statuses),to:name(to,next.statuses)}];
    }
    if(['description','steps','rootCause','corrective','preventive'].includes(key)){
     const summary=markup=>{
      if(!markup)return null;
      const template=document.createElement('template');
      template.innerHTML=markup;
      const images=template.content.querySelectorAll('img').length;
      return [template.content.textContent,images?images+' inline image'+(images===1?'':'s'):''].filter(Boolean).join(' · ');
     };
     return [{key,from:summary(from),to:summary(to)}];
    }
    return [{key,from,to}];
   });
   if(collection==='tasks'){
    const previousTimer=Object.values(before.activeTimers).find(timer=>timer.id===record.id);
    const currentTimer=Object.values(next.activeTimers).find(timer=>timer.id===record.id);
    if(previousTimer?.started!==currentTimer?.started){
     changes.push({key:'timer',from:previousTimer?.started??null,to:currentTimer?.started??null});
    }
   }
   if(!changes.length) continue;
   const requestIds=collection==='requests'?[record.id]:[...new Set([record.request,old?.request].filter(Boolean))];
   const taskIds=collection==='tasks'
    ? [...new Set([record.id,record.parentTask,old?.parentTask].filter(Boolean))]
    : [...new Set([record.task,old?.task].filter(Boolean))];
   const unlocked=collection==='tasks'&&old?.status==='Waiting'&&record.status==='Ready'&&
    blockedTask(old,before.tasks,before.statuses)&&!blockedTask(record,next.tasks,next.statuses);
   entries.push({actor,timestamp,action:collection==='tasks'&&next.tasks.some(task=>task.parentTask===record.id)?'Updated parent rollup':unlocked?'Dependency unlocked':action,requestIds,taskIds,
    recordId:record.id,recordName:record.parentTask?'Subtask':recordNames[collection],
    label:record.title??record.file??record.name,changes});
  }
 }
 return entries.length?{...next,activity:[...entries.reverse(),...before.activity]}:next;
}

function activityValue(key,value,date) {
 if(value==null||Array.isArray(value)&&!value.length) return '—';
 if(dateFields.includes(key)) return date(value);
 if(Array.isArray(value)) return value.join(', ');
 if(key==='description') return value.replace(/<[^>]*>/g,'');
 return String(value);
}

export function ActivityLog({entries,date}) {
 const [actor,setActor]=useState('All users');
 const actors=[...new Set(entries.map(entry=>entry.actor))].sort();
 const visible=entries.filter(entry=>actor==='All users'||entry.actor===actor);
 return <section className="panel activity"><div className="panel-header"><h2>Activity log</h2>
  <label>User <select value={actor} onChange={e=>setActor(e.target.value)}>
   {['All users',...actors].map(name=><option key={name}>{name}</option>)}</select></label></div>
  {visible.length?<div className="table-wrap"><table>
   <thead><tr><th>When</th><th>User</th><th>Action</th><th>Record</th><th>Field</th><th>Previous value</th><th>New value</th></tr></thead>
   <tbody>{visible.flatMap((entry,index)=>entry.changes.map(({key,from,to},line)=><tr key={index+'-'+line}>
    {line===0&&<><td rowSpan={entry.changes.length}>{date(entry.timestamp)}</td><td rowSpan={entry.changes.length}>{entry.actor}</td>
     <td rowSpan={entry.changes.length}>{entry.action}</td><td rowSpan={entry.changes.length}>{entry.label}<small>{entry.recordName} · {entry.recordId}</small></td></>}
    <td>{fieldNames[key]}</td><td>{activityValue(key,from,date)}</td><td>{activityValue(key,to,date)}</td>
   </tr>))}</tbody>
  </table></div>:<p className="empty">No matching activity recorded.</p>}
 </section>;
}

export function TaskSelect({label,value,options,save,disabled}) {
 return <select aria-label={label} value={value} disabled={disabled} onChange={e=>save(e.target.value)}>
  {options.map(option=>{
   const [key,text]=Array.isArray(option)?option:[option,option];
   return <option key={key} value={key}>{text}</option>;
  })}
 </select>;
}

function InlinePages({task,save}) {
 return <input aria-label={'Pages · '+task.id} type="number" min="1" max="100000" step="1"
  key={task.pages??''} defaultValue={task.pages??''} placeholder="—"
  onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.currentTarget.value=task.pages??'';e.currentTarget.blur();}}}
  onBlur={e=>{
   const input=e.currentTarget;
   if(!input.validity.valid){input.value=task.pages??'';return;}
   const pages=input.value===''?null:input.valueAsNumber;
   if(pages!==(task.pages??null))save({pages});
  }}/>;
}

export function InlineDue({task,zone,localValue,toInstant,save}) {
 const original=localValue(task.due,zone);
 return <input aria-label={'Due · '+task.id} type="datetime-local" required key={zone+task.due}
  defaultValue={original} onBlur={e=>{
   const input=e.currentTarget;
   if(input.value===original)return;
   const due=input.value?toInstant(input.value,zone):null;
   if(due)save({due});else input.value=original;
  }} onKeyDown={e=>{
   if(e.key==='Enter')e.currentTarget.blur();
   if(e.key==='Escape'){e.currentTarget.value=original;e.currentTarget.blur();}
  }}/>;
}

export function TaskStatus({task,statuses,locked,blocked,save}) {
 const currentGroup=statusGroup(statuses,task.status);
 const choices=statuses.filter(status=>status.id===task.status||
  (currentGroup==='Complete'?status.group==='Complete':!blocked||status.group==='To-do'));
 return <StatusPicker label={'Status · '+task.id} statuses={choices} value={task.status}
  disabled={locked} onChange={status=>save({status})}/>;
}

export function FileWorkflows({files,tasks,account,people,canManage,editable,locked,changeTask,openTask,
 addTask,addSubtask,canAddSubtask,taskAction,statusBadge,statuses,date,zone,localValue,toInstant}) {
 if(!files.length)return <p className="empty">Add a file to create its workflow.</p>;
 return <div className="file-workflows">{files.map(file=>{
  const items=tasks.filter(task=>task.fileId===file.id);
  const parents=parentTaskIds(items);
  const leaves=items.filter(task=>!parents.has(task.id));
  const rows=items.filter(task=>!task.parentTask||!items.some(parent=>parent.id===task.parentTask))
   .flatMap(task=>[task,...items.filter(child=>child.parentTask===task.id)]);
  return <details className="file-workflow" key={file.id} open>
   <summary><strong>{file.name}</strong><span>{leaves.filter(task=>statusGroup(statuses,task.status)==='Complete').length} / {leaves.length} complete</span></summary>
   {items.length?<div className="table-wrap"><table className="workflow-table">
    <thead><tr><th>Operation</th><th>Task type</th><th>Assignee</th><th>Pages</th><th>Due · {zone}</th><th>Effort</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{rows.map(task=>{
     const blocked=blockedTask(task,tasks,statuses);
     const parent=parents.has(task.id);
     const save=fields=>changeTask(task.id,fields);
     const effort=estimate(account,task.type,task.pages);
     return <tr key={task.id} className={task.parentTask?'workflow-subtask':''}>
      <td><button className="link record" onClick={()=>openTask(task.id)}>{task.parentTask?'↳ ':''}{task.type} <span aria-hidden="true">↗</span></button>
       <small>{task.parentTask?'Subtask · ':parent?'Parent task · ':''}{task.id}</small>
       {task.dependsOn&&<small>After {task.dependsOn}</small>}</td>
      <td>{canManage?<TaskSelect label={'Task type · '+task.id} value={task.type} options={types} disabled={locked(task.id)} save={type=>save({type})}/>:task.type}</td>
      <td>{parent?<span className="parent-note">Subtasks only</span>:canManage?<TaskSelect label={'Assignee · '+task.id} value={task.person||''} options={[[ '', 'Unassigned' ],...people]}
       disabled={locked(task.id)} save={person=>save({person})}/>:task.person||'Unassigned'}</td>
      <td>{!parent&&editable(task)?<InlinePages task={task} save={save}/>:task.pages??'—'}</td>
      <td>{canManage?<InlineDue {...{task,zone,localValue,toInstant,save}}/>:date(task.due)}</td>
      <td>{parent?'—':formatMinutes(effort.minutes)}{!parent&&effort.source==='Historical'&&<small>Historical</small>}</td>
      <td>{statusBadge(task.status)}{!parent&&editable(task)&&<TaskStatus task={task} statuses={statuses} locked={locked(task.id)} blocked={blocked} save={save}/>}</td>
      <td><div className="workflow-actions">{taskAction(task)}{canManage&&!task.parentTask&&<button disabled={!canAddSubtask(task)} onClick={()=>addSubtask(file,task)}>Add subtask</button>}</div></td>
     </tr>;
    })}</tbody>
   </table></div>:<p className="empty">No operations in this workflow yet.</p>}
   {canManage&&<div className="workflow-footer"><button onClick={()=>addTask(file)}>＋ Add task</button></div>}
  </details>;
 })}</div>;
}
