import {prerequisiteGroups} from './workflow-order';
import {blockedTask, dependencyIds, incompletePredecessors, isDependencyStatus, parentTaskIds, StatusPicker, statusColor, statusGroup, workflowOrder} from './status';
import React, {useState} from 'react';
import {zoneCode} from './time-zone';
import {estimate, formatMinutes} from './data';

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
 workflowFiles:['name','archivedAt'],
 tasks:['file','fileId','type','person','pages','status','due','scheduledStart','scheduledEnd','dependsOn','parentTask','spent','sessions'],
 defects:['title','severity','status','request','task','relatedTasks','description','filePath','steps','rootCause','corrective','preventive','attachments','assignedTo','reviewedBy','operator','team','account','acknowledgments'],
};
const recordNames = {requests:'Request',workflowFiles:'File',tasks:'Task',defects:'Defect'};
const fieldNames = {
 title:'Title',account:'Account',owner:'Project owner',person:'Assignee',type:'Task type',pages:'Pages',
 status:'Status',risk:'Delivery risk',due:'Due',forecast:'Forecast',files:'Planned files',types:'Task types',
 initialMinutes:'Estimated effort (min)',name:'File name',file:'Workflow file name',fileId:'Workflow file ID',scheduledStart:'Scheduled start',
 scheduledEnd:'Scheduled end',dependsOn:'Predecessor',parentTask:'Parent task',spent:'Recorded work (sec)',sessions:'Work sessions',
 severity:'Severity',request:'Related request',task:'Primary related task',relatedTasks:'Additional related tasks',description:'Incident summary',filePath:'File path',steps:'Steps & operators',rootCause:'Root cause',corrective:'Corrective actions',preventive:'Preventive actions',attachments:'Attachments',
 archivedAt:'Deleted at',timer:'Timer started at',assignedTo:'Assigned to',reviewedBy:'Reviewed by',operator:'Linked operator',team:'Team',acknowledgments:'Signed acknowledgment',
};
const dateFields = ['due','forecast','scheduledStart','scheduledEnd','timer','archivedAt'];
function trackedValue(key,value) {
 if(key==='acknowledgments')return value?.map(entry=>entry.signature+' · revision '+entry.revision)??[];
 return key==='attachments' ? value?.map(file=>file.name) : value==='' ? null : value??null;
}

export function withActivity(before, next, actor, timestamp, action) {
 if(next===before) return before;
 const entries = [];
 const authored={...next};
 for(const [collection, fields] of Object.entries(trackedFields)) {
  if(next[collection]===before[collection]) continue;
  const touched=new Set();
  const previous = new Map(before[collection].map(record=>[record.id,record]));
  for(const record of next[collection]) {
   const old=previous.get(record.id);
   if(record===old) continue;
   const changes=fields.flatMap(key=>{
    if(key==='sessions'&&action!=='Corrected work time')return [];
    const from=trackedValue(key,old?.[key]),to=trackedValue(key,record[key]);
    if(JSON.stringify(from)===JSON.stringify(to))return [];
    if(key==='type'&&collection==='tasks'){
     const name=(id,list)=>list?.find(type=>type.id===id)?.label??id;
     return [{key,from:name(from,before.taskTypes),to:name(to,next.taskTypes)}];
    }
    if(key==='account'){
     const name=(id,list)=>list?.find(account=>account.id===id)?.label??id;
     return [{key,from:name(from,before.accounts),to:name(to,next.accounts)}];
    }
    if(key==='status'&&collection!=='defects'){
     const name=(value,list)=>list?.find(status=>status.id===value)?.label??value;
     return [{key,from:name(from,collection==='requests'?before.requestStatuses:before.statuses),to:name(to,collection==='requests'?next.requestStatuses:next.statuses)}];
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
   touched.add(record.id);
   const requestIds=collection==='requests'?[record.id]:[...new Set([record.request,old?.request].filter(Boolean))];
   const taskIds=collection==='tasks'
    ? [...new Set([record.id,record.parentTask,old?.parentTask].filter(Boolean))]
    : [...new Set([record.task,old?.task,...(record.relatedTasks??[]),...(old?.relatedTasks??[])].filter(Boolean))];
   const unlocked=collection==='tasks'&&old&&isDependencyStatus(old.status)&&record.status==='Ready'&&
    blockedTask(old,before.tasks,before.statuses)&&!blockedTask(record,next.tasks,next.statuses);
   entries.push({actor,timestamp,action:collection==='tasks'&&next.tasks.some(task=>task.parentTask===record.id)?'Updated parent rollup':unlocked?'Dependency unlocked':action,requestIds,taskIds,
    recordId:record.id,recordName:record.parentTask?'Subtask':recordNames[collection],
    label:record.title??record.file??record.name,changes});
  }
  if(collection==='tasks'){
   const surviving=new Set(next.tasks.map(task=>task.id));
   for(const record of previous.values()){
    if(surviving.has(record.id))continue;
    entries.push({actor,timestamp,action,requestIds:[record.request],taskIds:[record.id,record.parentTask].filter(Boolean),
     recordId:record.id,recordName:record.parentTask?'Subtask':'Task',label:record.file,
     changes:[{key:'archivedAt',from:null,to:timestamp}]});
   }
  }
  if(touched.size)authored[collection]=next[collection].map(record=>touched.has(record.id)?{...record,modifiedBy:actor}:record);
 }
 return entries.length?{...authored,activity:[...entries.reverse(),...before.activity]}:next;
}

function activityValue(key,value,date) {
 if(value==null||Array.isArray(value)&&!value.length) return '—';
 if(dateFields.includes(key)) return date(value);
 if(key==='sessions')return value.map(session=>[session.operator,date(session.startedAt)+' – '+date(session.endedAt),
  session.correction?.reason].filter(Boolean).join(' · ')).join(' / ');
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

export function ZonedInput({zone,toInstant,initial='',onChange,onBlur,onKeyDown,...props}) {
 const [value,setValue]=useState(initial);
 return <span className="zoned-input"><input {...props} type="datetime-local" value={value}
  onChange={event=>{setValue(event.target.value);onChange?.(event);}}
  onKeyDown={event=>{
   if(event.key==='Escape'){event.currentTarget.value=initial;setValue(initial);event.currentTarget.blur();return;}
   onKeyDown?.(event);
  }}
  onBlur={event=>{const replacement=onBlur?.(event.target.value);if(typeof replacement==='string')setValue(replacement);}}/>
  <span className="zone-code">{zoneCode(zone,value&&toInstant(value,zone)||undefined)}</span></span>;
}

export function InlineDue({task,zone,localValue,toInstant,save,showError}) {
 const original=localValue(task.due,zone);
 return <ZonedInput aria-label={'Due · '+task.id} required key={zone+task.due} initial={original} {...{zone,toInstant}}
  onBlur={value=>{
   if(value===original)return;
   const due=value?toInstant(value,zone):null;
   if(due){save({due});return;}
   showError('Enter a valid due date and time for '+task.id+' in '+zoneCode(zone,task.due)+'.');
   return original;
  }} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>;
}

export function TaskStatus({task,statuses,locked,blocked,save,editor}) {
 const choices=statuses.filter(status=>status.id===task.status||!isDependencyStatus(status.id)&&
  (!blocked||status.group!=='To-do'));
 return <StatusPicker label={'Status · '+task.id} statuses={choices} value={task.status}
  disabled={locked} editor={editor} editLabel="Edit task status labels" onChange={status=>save({status})}/>;
}

export function TaskTypePicker({value,taskTypes,onChange,editor,label='Task type',disabled}){
 return <StatusPicker {...{value,label,onChange,editor,disabled}} placeholder="Select a task type"
  editLabel="Edit task types" groupOrder={['Task types']} color={()=>'gray'}
  statuses={taskTypes.map(item=>({...item,group:'Task types'}))}/>;
}

export function FileKanban({files,tasks,statuses,openFile}){
 const columns={'To-do':[],'In progress':[],'Complete':[]};
 const parents=parentTaskIds(tasks);
 const byFile=new Map();
 for(const task of tasks){
  if(parents.has(task.id))continue;
  const counts=byFile.get(task.fileId)??{total:0,complete:0,started:false};
  const group=statusGroup(statuses,task.status);
  counts.total++;
  if(group==='Complete')counts.complete++;
  if(group!=='To-do')counts.started=true;
  byFile.set(task.fileId,counts);
 }
 for(const file of files){
  const {total,complete,started}=byFile.get(file.id)??{total:0,complete:0,started:false};
  const group=total>0&&total===complete?'Complete':started?'In progress':'To-do';
  columns[group].push({file,total,complete});
 }
 return <div className="file-kanban" aria-label="File workflow board">
  {Object.entries(columns).map(([group,cards])=><section className="kanban-column" key={group}>
   <h2><span className={'badge '+statusColor(group)}><i/>{group}</span> <span>{cards.length}</span></h2>
   {cards.length?cards.map(({file,total,complete})=><button type="button" className="kanban-card" key={file.id}
    onClick={()=>openFile(file.id)}><strong>{file.name}</strong><small>{total?complete+' / '+total+' steps finished':'No workflow steps'}</small></button>):
    <p className="empty">No files</p>}
  </section>)}
 </div>;
}

export const bulkWorkflowFields={type:'Type',person:'Assignee',status:'Status',pages:'Pages',due:'Due date',
 schedule:'Schedule',dependsOn:'Prerequisite',parentTask:'Parent'};

export function FileWorkflows({files,tasks,account,people,canManage,editable,locked,changeTask,openTask,
 addTask,editFile,deleteFile,addSubtask,canAddSubtask,taskAction,statusBadge,statuses,date,zone,localValue,toInstant,showError,taskTypes,typeLabel,taskStatusEditor,taskTypeEditor,orders,moveTask,deleteTasks,removeDependency,editSelected}) {
 const [drag,setDrag]=useState(null);
 const [target,setTarget]=useState(null);
 const [selection,setSelection]=useState(()=>new Set());
 function select(ids,checked){
  setSelection(current=>{
   const next=new Set(current);
   for(const id of ids){if(checked)next.add(id);else next.delete(id);}
   return next;
  });
 }
 const draggedTask=drag&&tasks.find(task=>task.id===drag.id);
 function placement(event){
  const rect=event.currentTarget.getBoundingClientRect();
  const fraction=(event.clientY-rect.top)/rect.height;
  return fraction<.27?'sequence':fraction>.73?'after':'inside';
 }
 function drop(file,event,id,mode=placement(event)){
  event.preventDefault();
  if(drag?.file===file.id)moveTask(file.id,drag.id,id,mode);
  setDrag(null);setTarget(null);
 }
 if(!files.length)return <p className="empty">Add a file to create its workflow.</p>;
 const selectedIds=tasks.filter(task=>!task.workflowGroup&&selection.has(task.id)).map(task=>task.id);
 return <div className="file-workflows">
  {canManage&&selectedIds.length>0&&<div className="workflow-bulk" role="toolbar" aria-label="Selected workflow tasks">
   <span aria-live="polite">{selectedIds.length} selected</span>
   {Object.entries(bulkWorkflowFields).map(([field,label])=><button type="button" key={field} onClick={()=>editSelected(selectedIds,field)}>{label}</button>)}
   <button type="button" className="file-danger" onClick={()=>deleteTasks(selectedIds)}>Delete</button>
   <button type="button" aria-label="Clear task selection" onClick={()=>select(selectedIds,false)}>×</button>
  </div>}
  {files.map(file=>{
  const items=tasks.filter(task=>task.fileId===file.id);
  const parents=parentTaskIds(items);
  const leaves=items.filter(task=>!parents.has(task.id));
  const rows=workflowOrder(items,orders[file.id]);
  const {segments,lanes}=prerequisiteGroups(rows);
  const ids=rows.filter(task=>!task.workflowGroup).map(task=>task.id);
  const selected=ids.filter(id=>selection.has(id));
  const allSelected=ids.length>0&&selected.length===ids.length;
  const byId=new Map(tasks.map(task=>[task.id,task]));
  const linkedTask=id=>{
   const linked=byId.get(id);
   return linked&&<button className="link" key={id} onClick={()=>openTask(id)}>{typeLabel(linked.type)} · {id}</button>;
  };
  return <details className="file-workflow" id={'workflow-'+file.id} key={file.id} open>
   <summary>
    <strong>{file.name}</strong>
    {canManage&&<button type="button" className="file-rename" title="Rename file" aria-label={'Rename file '+file.name}
     onClick={event=>{event.preventDefault();event.stopPropagation();editFile(file);}}>✎</button>}
    <span className="file-progress">{leaves.filter(task=>statusGroup(statuses,task.status)==='Complete').length} / {leaves.length} complete</span>
    {canManage&&<button type="button" className="file-delete file-danger" aria-label={'Delete file '+file.name}
     onClick={event=>{event.preventDefault();event.stopPropagation();deleteFile(file);}}>Delete</button>}
   </summary>
   {items.length?<div className="table-wrap"><table className="workflow-table" style={{'--prerequisite-gutter':lanes*9+'px'}}>
    <thead><tr>{canManage&&<th className="workflow-selection" aria-label="Selection"><label>
     <input type="checkbox" aria-label={'Select all tasks for '+file.name} checked={allSelected} data-visible={selected.length>0}
      ref={input=>{if(input)input.indeterminate=selected.length>0&&!allSelected;}}
      onChange={event=>select(ids,event.target.checked)}/>
    </label></th>}<th>Operation</th><th>Task type</th><th>Operator</th><th>Pages</th><th>Due</th><th>Effort</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{rows.map((task,rowIndex)=>{
     const blockers=incompletePredecessors(task,tasks,statuses);
     const blocked=blockers.length>0;
     const parent=parents.has(task.id);
     const predecessors=dependencyIds(task,tasks);
     let depth=0;
     const seen=new Set([task.id]);
     for(let ancestor=byId.get(task.parentTask);ancestor&&!seen.has(ancestor.id);ancestor=byId.get(ancestor.parentTask)){
      depth++;seen.add(ancestor.id);
     }
     const save=fields=>changeTask(task.id,fields);
     const effort=estimate(account,task.type,task.pages);
     const parentTask=byId.get(task.parentTask);
     const targetMode=target?.id===task.id?target.mode:null;
     const siblings=rows.filter(row=>(row.parentTask||null)===(task.parentTask||null));
     const index=siblings.indexOf(task);
     const checked=selection.has(task.id);
     return <tr key={task.id} data-selected={canManage&&checked} className={(task.workflowGroup?'workflow-group-row ':'')+(task.parentTask?'workflow-subtask ':'')+(targetMode?'drag-'+targetMode:'')}
      onDragOver={event=>{if(drag?.file===file.id&&drag.id!==task.id){event.preventDefault();const mode=placement(event);if(target?.id!==task.id||target.mode!==mode)setTarget({id:task.id,mode});}}}
      onDrop={event=>drop(file,event,task.id)}>
      {canManage&&<td className="workflow-selection">{!task.workflowGroup&&<label>
       <input type="checkbox" aria-label={'Select task '+task.id} checked={checked} data-visible={checked}
        onChange={event=>select([task.id],event.target.checked)}/>
      </label>}</td>}
      <td className="workflow-operation-cell" style={{'--workflow-indent':Math.min(depth,5)*18+'px'}}>
       {segments[rowIndex].map(({id,lane,first,last,branch})=><span key={id} aria-hidden="true"
        className="workflow-prerequisite-line" data-first={first} data-last={last} data-branch={branch}
        style={{'--prerequisite-lane':lane*9+'px'}}/>)}
       <div className="workflow-operation" style={{marginInlineStart:Math.min(depth,5)*18}} data-movable={canManage&&items.length>1}>
       {canManage&&(items.length>1||task.parentTask)&&<button type="button" className="drag-handle" draggable title="Drop at the top to start after this task, in the center to nest, or at the bottom to reorder. Up and Down reorder. Left promotes to top level."
        aria-label={'Reorder '+task.id} onDragStart={event=>{
         event.dataTransfer.setData('text/plain',task.id);event.dataTransfer.effectAllowed='move';setDrag({file:file.id,id:task.id});
        }} onDragEnd={()=>{setDrag(null);setTarget(null);}} onKeyDown={event=>{
         if(event.key==='ArrowLeft'&&task.parentTask){event.preventDefault();moveTask(file.id,task.id,null,'root');return;}
         if(!['ArrowUp','ArrowDown'].includes(event.key))return;
         const direction=event.key==='ArrowDown'?1:-1;
         const other=siblings[index+direction];
         if(other){event.preventDefault();moveTask(file.id,task.id,other.id,direction>0?'after':'before');}
        }}>⠿</button>}
       <button className="link record" onClick={()=>openTask(task.id)}>{typeLabel(task.type)}{task.workflowGroup?' group':''} <span aria-hidden="true">↗</span></button>
       {!task.workflowGroup&&<small>{parent?'Parent task · ':''}{task.id}</small>}
       {parentTask&&<small className="workflow-relation child-relation">
        <button type="button" className="link" onClick={()=>openTask(parentTask.id)}>
         <span aria-hidden="true">↳ </span>{typeLabel(parentTask.type)}{parentTask.workflowGroup?' group':' - '+parentTask.id}
        </button></small>}
       {targetMode&&<span className={'workflow-drop-hint workflow-drop-'+targetMode}>
        {targetMode==='sequence'?'Start after '+task.id:targetMode==='inside'?(draggedTask?.type===task.type&&!parent?'Group with ':'Make a subtask of ')+(task.workflowGroup?typeLabel(task.type)+' group':task.id):'Reorder below '+task.id}
        {targetMode==='sequence'&&draggedTask?.dependsOn&&draggedTask.dependsOn!==task.id&&
         ' · replaces '+draggedTask.dependsOn}
       </span>}
       {predecessors.length>0&&<small className={'workflow-relation dependency-relation '+(blocked?'workflow-blocked':'')}>
        <span>{blocked?'Waiting':'After'}</span>{predecessors.map(id=><span className="workflow-dependency" key={id}>
         {linkedTask(id)}{canManage&&task.dependsOn===id&&<button type="button" className="dependency-remove"
          aria-label={'Remove prerequisite '+id+' from '+task.id} title="Remove prerequisite"
          onClick={()=>removeDependency(task.id,id)}>×</button>}
        </span>)}</small>}
      </div></td>
      <td>{canManage&&!task.parentTask?<TaskTypePicker label={'Task type · '+task.id} value={task.type} {...{taskTypes}} disabled={locked(task.id)} editor={taskTypeEditor} onChange={type=>save({type})}/>:typeLabel(task.type)}</td>
      <td>{parent?<span className="parent-note">Subtasks only</span>:canManage?<TaskSelect label={'Operator · '+task.id} value={task.person||''} options={[[ '', 'Unassigned' ],...people]}
       disabled={locked(task.id)} save={person=>save({person})}/>:task.person||'Unassigned'}</td>
      <td>{task.workflowGroup?'—':editable(task)?<InlinePages task={task} save={save}/>:task.pages??'—'}</td>
      <td>{task.workflowGroup?'—':canManage?<InlineDue {...{task,zone,localValue,toInstant,save,showError}}/>:date(task.due)}</td>
      <td>{parent?'—':formatMinutes(effort.minutes)}{!parent&&effort.source==='Historical'&&<small>Historical</small>}</td>
      <td>{!parent&&editable(task)?<TaskStatus task={task} statuses={statuses} locked={locked(task.id)} blocked={blocked} save={save} editor={taskStatusEditor}/>:statusBadge(task.status)}</td>
      <td><div className="workflow-actions">{taskAction(task)}{canManage&&<button disabled={!canAddSubtask(task)} onClick={()=>addSubtask(file,task)}>Add subtask</button>}{canManage&&!task.workflowGroup&&<button type="button" className="file-danger" aria-label={'Delete task '+task.id} onClick={()=>deleteTasks([task.id])}>Delete</button>}</div></td>
     </tr>;
    })}</tbody>
   </table></div>:<p className="empty">No operations in this workflow yet.</p>}
   {canManage&&drag?.file===file.id&&<div className="root-drop" onDragOver={event=>event.preventDefault()}
    onDrop={event=>drop(file,event,null,'root')}>Drop here to make a top-level task</div>}
   {canManage&&<div className="workflow-footer"><button onClick={()=>addTask(file)}>＋ Add task</button></div>}
  </details>;
 })}</div>;
}
