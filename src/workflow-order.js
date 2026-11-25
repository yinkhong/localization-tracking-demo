import {workflowOrder} from './status.jsx';
import {updateRelationships} from './task-relations.jsx';

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
 const parent=placement==='root'?'':placement==='inside'?anchor.id:anchor.parentTask||'';
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

export function prerequisiteGroups(rows){
 const members=new Map();
 rows.forEach((task,index)=>{
  if(!task.dependsOn)return;
  const group=members.get(task.dependsOn)??[];
  group.push(index);
  members.set(task.dependsOn,group);
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
