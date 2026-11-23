import React, {useState} from 'react';

export const groups = ['To-do','In progress','Complete'];
export const initialStatuses = [
 {id:'Ready',label:'Ready',group:'To-do'},
 {id:'Waiting',label:'Waiting',group:'To-do'},
 {id:'In progress',label:'In progress',group:'In progress'},
 {id:'Paused',label:'Paused',group:'In progress'},
 {id:'Complete',label:'Complete',group:'Complete'},
];

export function statusGroup(statuses,id) {
 return statuses.find(item=>item.id===id)?.group;
}



export function StatusPicker({statuses,value,onChange,label,disabled=false}) {
 return <select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>
  {groups.map(group=>[group,statuses.filter(status=>status.group===group)]).filter(([,items])=>items.length).map(([group,items])=><optgroup label={group} key={group}>
   {items.map(status=><option key={status.id} value={status.id}>{status.label}</option>)}
  </optgroup>)}
 </select>;
}

export function StatusAdmin({statuses,save}) {
 const [error,setError]=useState('');
 function update(event,id,group){
  event.preventDefault();
  const field=event.currentTarget.elements.label;
  const label=field.value.trim();
  if(!label||statuses.some(status=>status.id!==id&&status.label.toLowerCase()===label.toLowerCase())){
   setError('Enter a unique status label.');return;
  }
  save(id?statuses.map(status=>status.id===id?{...status,label}:status):[...statuses,{id:crypto.randomUUID(),label,group}]);
  if(!id)field.value='';
  setError('');
 }
 return <section className="panel"><div className="panel-header"><div><h2>Status labels</h2>
  <p>Labels are shared by requests, tasks, and subtasks. Rename a label to update it everywhere.</p></div></div>
  {error&&<p className="note error" role="alert">{error}</p>}
  <div className="status-settings">{groups.map(group=><section key={group}><h3>{group}</h3>
   {statuses.filter(status=>status.group===group).map(status=><form key={status.id+status.label} onSubmit={e=>update(e,status.id,group)}>
    <input name="label" aria-label={status.label+' label'} required maxLength="32" defaultValue={status.label}/>
    <button>Rename</button>
   </form>)}
   <form onSubmit={e=>update(e,null,group)}><input name="label" aria-label={'New '+group+' label'} required maxLength="32" placeholder="New label"/>
    <button>Add</button></form>
  </section>)}</div>
 </section>;
}

export function parentTaskIds(tasks) {
 return new Set(tasks.map(task=>task.parentTask).filter(Boolean));
}

export function dependencyIds(task,tasks) {
 const byId = new Map(tasks.map(item=>[item.id,item]));
 const chain = new Set([task.id]);
 const predecessors = [];
 for(let current=task;current;current=byId.get(current.parentTask)){
  if(current.dependsOn)predecessors.push(current.dependsOn);
  if(!current.parentTask||chain.has(current.parentTask))break;
  chain.add(current.parentTask);
 }
 return [...new Set(predecessors)].filter(id=>!chain.has(id));
}

export function blockedTask(task,tasks,statuses) {
 return dependencyIds(task,tasks).some(id=>tasks.some(item=>item.id===id&&statusGroup(statuses,item.status)!=='Complete'));
}

export function resolveTasks(tasks,statuses,timestamp) {
 const parents=parentTaskIds(tasks);
 let prior=tasks;
 for(let pass=0;pass<=tasks.length;pass++){
  const next=prior.map(task=>{
   if(parents.has(task.id)){
    const children=prior.filter(child=>child.parentTask===task.id);
    const phases=children.map(child=>statusGroup(statuses,child.status));
    const status=phases.every(group=>group==='Complete')?'Complete':
     phases.some(group=>group!=='To-do')?'In progress':blockedTask(task,prior,statuses)?'Waiting':'Ready';
    if(task.status!==status||task.person||task.assignedAt!=null){
     return {...task,status,person:'',assignedAt:null,modifiedAt:timestamp};
    }
   }else if(task.status==='Waiting'&&!blockedTask(task,prior,statuses)){
    return {...task,status:'Ready',modifiedAt:timestamp};
   }else if(statusGroup(statuses,task.status)==='To-do'&&task.status==='Ready'&&blockedTask(task,prior,statuses)){
    return {...task,status:'Waiting',modifiedAt:timestamp};
   }
   return task;
  });
  if(next.every((task,index)=>task===prior[index]))return prior;
  prior=next;
 }
 return prior;
}

export function bootstrapStatuses(state) {
 const statuses=state.statuses??initialStatuses;
 const timestamp=Date.now();
 const parents=parentTaskIds(state.tasks);
 const activeTimers={...state.activeTimers};
 const tasks=state.tasks.map(task=>{
  if(!parents.has(task.id))return task;
  const running=Object.values(activeTimers).find(timer=>timer.id===task.id);
  if(!running)return task;
  delete activeTimers[running.operator];
  const duration=Math.max(0,Math.floor((timestamp-running.started)/1000));
  return {...task,spent:(task.spent??0)+duration,sessions:[...(task.sessions??[]),{
   startedAt:running.started,endedAt:timestamp,operator:running.operator,
   openedWith:running.openedWith??'Started',closedWith:'Paused',
  }]};
 });
 return {...state,statuses,activeTimers,tasks:resolveTasks(tasks,statuses,timestamp)};
}
