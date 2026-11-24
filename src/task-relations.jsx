import React, {useState} from 'react';
import {blockedTask, dependencyIds, parentTaskIds, resolveTasks, statusGroup} from './status';

export function updateRelationships(tasks,id,changes,statuses,timers,timestamp){
 const task=tasks.find(item=>item.id===id);
 if(!task)return {error:'This task is no longer available.'};
 const {fileId,parentTask,dependsOn,children}=changes;
 const parentIds=parentTaskIds(tasks);
 const siblings=tasks.filter(item=>item.id!==id&&item.request===task.request&&item.fileId===fileId);
 if((parentTask&&!siblings.some(item=>item.id===parentTask))||
    (dependsOn&&!siblings.some(item=>item.id===dependsOn))||
    children.some(child=>!siblings.some(item=>item.id===child))){
  return {error:'Choose a parent, predecessor, and subtasks from the same file.'};
 }
 const next=tasks.map(item=>{
  if(item.id===id){
   if(item.fileId===fileId&&(item.parentTask||'')===parentTask&&(item.dependsOn||'')===dependsOn)return item;
   return {...item,fileId,file:changes.file,parentTask:parentTask||null,dependsOn:dependsOn||null,modifiedAt:timestamp};
  }
  const nextParent=children.includes(item.id)?id:item.parentTask===id?null:item.parentTask;
  return nextParent===item.parentTask?item:{...item,parentTask:nextParent,modifiedAt:timestamp};
 });
 const byId=new Map(next.map(item=>[item.id,item]));
 for(const item of next){
  for(const reference of [item.parentTask,item.dependsOn].filter(Boolean)){
   const linked=byId.get(reference);
   if(linked&&(linked.request!==item.request||linked.fileId!==item.fileId))return {error:'Remove links to the original file before moving this task.'};
  }
  const ancestors=new Set([item.id]);
  for(let cursor=byId.get(item.parentTask);cursor;cursor=byId.get(cursor.parentTask)){
   if(ancestors.has(cursor.id))return {error:'A task cannot be its own ancestor.'};
   ancestors.add(cursor.id);
  }
  const previous=tasks.find(task=>task.id===item.id);
  if(item.dependsOn&&ancestors.has(item.dependsOn)&&item!==previous)return {error:'A subtask cannot wait for its own parent to finish.'};
 }
 const nextParents=parentTaskIds(next);
 if(timers.some(timer=>nextParents.has(timer.id)&&!parentIds.has(timer.id))){
  return {error:'Pause the running timer before making that task a parent.'};
 }
 const visiting=new Set(),visited=new Set();
 function hasCycle(item){
  if(!item||visited.has(item.id))return false;
  if(visiting.has(item.id))return true;
  visiting.add(item.id);
  const required=[...dependencyIds(item,next),...next.filter(child=>child.parentTask===item.id).map(child=>child.id)];
  if(required.some(id=>hasCycle(byId.get(id))))return true;
  visiting.delete(item.id);visited.add(item.id);
  return false;
 }
 if(next.some(hasCycle))return {error:'These relationships create a dependency loop.'};
 const previousById=new Map(tasks.map(item=>[item.id,item]));
 const moving=new Set(next.filter(item=>item.parentTask&&item.parentTask!==previousById.get(item.id)?.parentTask).map(item=>item.id));
 const inherited=next.map(item=>{
  let cursor=item,type;
  while(cursor.parentTask){
   if(moving.has(cursor.id))type=byId.get(cursor.parentTask)?.type;
   const ancestor=byId.get(cursor.parentTask);
   if(!ancestor)break;
   cursor=ancestor;
  }
  return type&&type!==item.type?{...item,type,modifiedAt:timestamp}:item;
 });
 if(timers.some(timer=>inherited.find(item=>item.id===timer.id)?.type!==previousById.get(timer.id)?.type)){
  return {error:'Pause the running timer before moving work to a parent with another task type.'};
 }
 const resolved=resolveTasks(inherited,statuses,timestamp);
 if(resolved.some(item=>statusGroup(statuses,item.status)!=='To-do'&&blockedTask(item,resolved,statuses)&&
   !blockedTask(tasks.find(task=>task.id===item.id),tasks,statuses))){
  return {error:'Finish the new prerequisite first. A task that has already started cannot gain an incomplete prerequisite.'};
 }
 return {tasks:resolved};
}

export function TaskRelationships({task,tasks,files,save,typeLabel=id=>id}){
 const [fileId,setFileId]=useState(task.fileId);
 const [parent,setParent]=useState(task.parentTask||'');
 const [predecessor,setPredecessor]=useState(task.dependsOn||'');
 const [children,setChildren]=useState(tasks.filter(item=>item.parentTask===task.id).map(item=>item.id));
 const options=tasks.filter(item=>item.id!==task.id&&item.fileId===fileId);
 const name=item=>typeLabel(item.type)+' · '+item.id;
 return <section className="panel task-relationships">
  <div className="panel-header"><h2>Workflow relationships</h2></div>
  <form onSubmit={event=>{
   event.preventDefault();
   save({fileId,file:files.find(file=>file.id===fileId).name,parentTask:parent,dependsOn:predecessor,children});
  }}>
   <div className="form-grid">
    <label>Workflow file<select value={fileId} onChange={event=>{setFileId(event.target.value);setParent('');setPredecessor('');setChildren([]);}}>
     {files.map(file=><option key={file.id} value={file.id}>{file.name}</option>)}
    </select></label>
    <label>Parent task<select value={parent} onChange={event=>setParent(event.target.value)}>
     <option value="">No parent · top-level task</option>
     {options.filter(item=>!children.includes(item.id)).map(item=><option value={item.id} key={item.id}>{name(item)}</option>)}
    </select></label>
    <label>Depends on<select value={predecessor} onChange={event=>setPredecessor(event.target.value)}>
     <option value="">No prerequisite</option>
     {options.filter(item=>item.id!==parent).map(item=><option value={item.id} key={item.id}>{name(item)}</option>)}
    </select></label>
   </div>
   <fieldset><legend>Subtasks</legend><div className="relationship-options">
    {options.filter(item=>item.id!==parent).map(item=><label key={item.id}>
     <input type="checkbox" checked={children.includes(item.id)} onChange={event=>setChildren(ids=>
      event.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>{name(item)}
    </label>)}
    {!options.length&&<p>No other tasks on this file.</p>}
   </div></fieldset>
   <button type="submit" className="primary">Save relationships</button>
  </form>
 </section>;
}
