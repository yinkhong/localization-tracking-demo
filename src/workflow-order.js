import {workflowOrder,parentTaskIds,dependencyIds,blockedTask,resolveTasks,statusGroup} from './status.jsx';
import {updateRelationships} from './task-relations.jsx';
import {patchRecord} from './timeline';

export function reorderWorkflowRows(tasks,order,source,target,after=false){
 const rows=workflowOrder(tasks,order);
 const from=rows.find(task=>task.id===source),to=rows.find(task=>task.id===target);
 if(!from||!to||from===to)return {};
 if((from.parentTask||null)!==(to.parentTask||null))return {error:'Reorder tasks at the same level. Change the parent on the task page.'};
 const requested=rows.filter(task=>task.id!==source).map(task=>task.id);
 requested.splice(requested.indexOf(target)+Number(after),0,source);
 const siblings=list=>list.filter(task=>(task.parentTask||null)===(from.parentTask||null)).map(task=>task.id);
 const byId=new Map(rows.map(task=>[task.id,task]));
 const desired=siblings(requested.map(id=>byId.get(id)));
 const resolved=workflowOrder(tasks,requested);
 if(siblings(resolved).some((id,index)=>id!==desired[index]))return {error:'Keep prerequisites above the tasks that depend on them.'};
 return {order:resolved.map(task=>task.id)};
}


export function moveWorkflowTask(tasks,file,order,source,target,placement,statuses,timers,timestamp){
 const item=tasks.find(task=>task.id===source&&task.fileId===file);
 const anchor=tasks.find(task=>task.id===target&&task.fileId===file);
 if(!item||placement!=='root'&&(!anchor||item===anchor))return {};
 const existingGroup=tasks.find(task=>task.workflowGroup&&task.id===anchor?.parentTask);
 const anchorIsParent=tasks.some(task=>task.parentTask===target);
 if(placement==='inside'&&item.type===anchor.type&&!anchorIsParent&&!existingGroup){
  const id='group-'+source+'-'+target+'-'+timestamp;
  const group={id,workflowGroup:true,fileId:file,file:item.file,request:item.request,type:item.type,
   parentTask:anchor.parentTask??null,status:'Ready',person:'',createdAt:timestamp,modifiedAt:timestamp};
  const updated=updateRelationships([...tasks,group],id,{fileId:file,file:item.file,parentTask:group.parentTask||'',
   dependsOn:'',children:[target,source]},statuses,timers,timestamp);
  if(updated.error)return updated;
  const rows=workflowOrder(tasks.filter(task=>task.fileId===file),order);
  const priority=rows.flatMap(task=>task.id===anchor.id?[id,target,source]:task.id===source?[]:[task.id]);
  return {tasks:updated.tasks,order:workflowOrder(updated.tasks.filter(task=>task.fileId===file),priority).map(task=>task.id)};
 }
 const parent=placement==='root'?'':placement==='inside'?(existingGroup&&item.type===anchor.type?existingGroup.id:anchor.id):anchor.parentTask||'';
 const predecessor=placement==='sequence'?anchor.id:item.dependsOn||'';
 let updated=tasks;
 if(parent!==(item.parentTask||'')||predecessor!==(item.dependsOn||'')){
  const result=updateRelationships(tasks,item.id,{fileId:file,file:item.file,parentTask:parent,
   dependsOn:predecessor,children:tasks.filter(task=>task.parentTask===item.id).map(task=>task.id)},statuses,timers,timestamp);
  if(result.error)return result;
  updated=result.tasks;
 }
 const rows=updated.filter(task=>task.fileId===file);
 if(placement==='root'||placement==='inside'){
  const priority=workflowOrder(rows,order).filter(task=>task.id!==item.id).map(task=>task.id);
  return {tasks:updated,order:workflowOrder(rows,[...priority,item.id]).map(task=>task.id)};
 }
 const result=reorderWorkflowRows(rows,order,source,target,placement==='after'||placement==='sequence');
 return result.error?result:{...result,tasks:updated};
}

export function removeWorkflowTasks(state,ids,timestamp,actor){
 const selected=new Set(ids);
 const archivedFiles=new Set(state.workflowFiles.filter(file=>file.archivedAt).map(file=>file.id));
 const removed=state.tasks.filter(task=>selected.has(task.id)&&!archivedFiles.has(task.fileId));
 if(!removed.length)return state;
 const removedIds=new Set(removed.map(task=>task.id));
 if(Object.values(state.activeTimers).some(timer=>removedIds.has(timer.id)))return state;
 const tasks=state.tasks.filter(task=>!removedIds.has(task.id)).map(task=>{
  const losesParent=removedIds.has(task.parentTask);
  const losesPrerequisite=removedIds.has(task.dependsOn);
  if(!losesParent&&!losesPrerequisite)return task;
  return {...task,parentTask:losesParent?null:task.parentTask,dependsOn:losesPrerequisite?null:task.dependsOn,modifiedAt:timestamp};
 });
 const workflowOrders=Object.fromEntries(Object.entries(state.workflowOrders??{}).map(([file,order])=>
  [file,order.filter(id=>!removedIds.has(id))]));
 const deletedTasks=[...(state.deletedTasks??[]),...removed.map(task=>({...task,deletedAt:timestamp,modifiedAt:timestamp,modifiedBy:actor}))];
 return {...state,tasks,workflowOrders,deletedTasks};
}

export function removeEmptyWorkflowGroups(state){
 let tasks=state.tasks;
 let parents=parentTaskIds(tasks);
 const removed=new Set();
 while(tasks.some(task=>task.workflowGroup&&!parents.has(task.id))){
  for(const task of tasks)if(task.workflowGroup&&!parents.has(task.id))removed.add(task.id);
  tasks=tasks.filter(task=>!removed.has(task.id));
  parents=parentTaskIds(tasks);
 }
 if(!removed.size)return state;
 return {...state,tasks:tasks.map(task=>removed.has(task.dependsOn)?{...task,dependsOn:null}:task),
  workflowOrders:Object.fromEntries(Object.entries(state.workflowOrders??{}).map(([file,order])=>[file,order.filter(id=>!removed.has(id))]))};
}

export function prerequisiteGroups(rows){
 const parents=parentTaskIds(rows);
 const members=new Map();
 rows.forEach((task,index)=>{
  if(parents.has(task.id))return;
  const key=JSON.stringify([task.parentTask??null,[...dependencyIds(task,rows)].sort()]);
  const group=members.get(key)??[];
  group.push(index);
  members.set(key,group);
 });
 const segments=rows.map(()=>[]);
 const laneEnds=[];
 for(const [id,indices] of [...members].sort(([,a],[,b])=>a[0]-b[0])){
  if(indices.length<2)continue;
  const first=indices[0],last=indices.at(-1);
  const freeLane=laneEnds.findIndex(end=>end<first);
  const lane=freeLane<0?laneEnds.length:freeLane;
  laneEnds[lane]=last;
  const branchRows=new Set(indices);
  for(let index=first;index<=last;index++){
   segments[index].push({id,lane,first:index===first,last:index===last,branch:branchRows.has(index)});
  }
 }
 return {segments,lanes:laneEnds.length};
}

export function bulkWorkflowUpdate(tasks,ids,field,value,statuses,timers,timestamp){
 const selected=new Set(ids);
 const chosen=tasks.filter(task=>selected.has(task.id)&&!task.workflowGroup);
 if(chosen.length!==selected.size||!chosen.length)return {error:'Select existing tasks to edit.'};
 const parents=parentTaskIds(tasks);
 const relationship=field==='parentTask'||field==='dependsOn';
 if(relationship){
  if(value&&selected.has(value))return {error:'Choose a task outside the selection.'};
  let next=tasks;
  for(const task of chosen){
   const changes={fileId:task.fileId,file:task.file,parentTask:task.parentTask||'',dependsOn:task.dependsOn||'',
    children:next.filter(child=>child.parentTask===task.id).map(child=>child.id),[field]:value};
   const result=updateRelationships(next,task.id,changes,statuses,timers,timestamp);
   if(result.error)return result;
   next=result.tasks;
  }
  return {tasks:next};
 }
 if(['person','status','type'].includes(field)&&timers.some(timer=>selected.has(timer.id))){
  return {error:'Pause the selected tasks’ timers before applying this change.'};
 }
 if(field==='type'){
  const byId=new Map(tasks.map(task=>[task.id,task]));
  const affected=new Set(chosen.map(task=>task.id));
  for(const task of tasks){
   const ancestors=new Set();
   for(let parent=byId.get(task.parentTask);parent&&!ancestors.has(parent.id);parent=byId.get(parent.parentTask)){
    ancestors.add(parent.id);
    if(selected.has(parent.id)){affected.add(task.id);break;}
   }
  }
  if(chosen.some(task=>task.parentTask&&!affected.has(task.parentTask)&&byId.get(task.parentTask)?.type!==value)){
   return {error:'A subtask uses its parent’s type. Change the parent’s type first.'};
  }
  if(timers.some(timer=>affected.has(timer.id)&&byId.get(timer.id)?.type!==value)){
   return {error:'Pause timers on the affected subtasks before changing their type.'};
  }
  return {tasks:tasks.map(task=>affected.has(task.id)?{...task,type:value,modifiedAt:timestamp}:task)};
 }
 const fields=field==='schedule'?value:{[field]:value};
 if(field==='pages')fields.pagesManual=true;
 const affected=chosen.filter(task=>!['person','status'].includes(field)||!parents.has(task.id));
 if(!affected.length)return {error:'This field is calculated for parent tasks. Select their subtasks to edit it.'};
 if(field==='status'&&statusGroup(statuses,value)!=='To-do'&&affected.some(task=>blockedTask(task,tasks,statuses))){
  return {error:'Complete the prerequisites for the selected tasks before changing their status.'};
 }
 const idsToUpdate=new Set(affected.map(task=>task.id));
 const next=tasks.map(task=>idsToUpdate.has(task.id)?patchRecord(task,fields,timestamp,'person'):task);
 if(field==='status'){
  const resolved=resolveTasks(next,statuses,timestamp);
  const before=new Map(tasks.map(task=>[task.id,task]));
  if(resolved.some(task=>statusGroup(statuses,task.status)!=='To-do'&&blockedTask(task,resolved,statuses)&&
   !blockedTask(before.get(task.id),tasks,statuses)))return {error:'A downstream task has already started. Keep its prerequisite complete.'};
 }
 return {tasks:next};
}
