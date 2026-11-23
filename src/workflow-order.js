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
 let updated=tasks;
 if(parent!==(item.parentTask||'')){
  const result=updateRelationships(tasks,item.id,{fileId:file,file:item.file,parentTask:parent,
   dependsOn:item.dependsOn||'',children:tasks.filter(task=>task.parentTask===item.id).map(task=>task.id)},statuses,timers,timestamp);
  if(result.error)return result;
  updated=result.tasks;
 }
 const rows=updated.filter(task=>task.fileId===file);
 if(placement==='root'||placement==='inside'){
  const priority=workflowOrder(rows,order).filter(task=>task.id!==item.id).map(task=>task.id);
  return {tasks:updated,order:workflowOrder(rows,[...priority,item.id]).map(task=>task.id)};
 }
 const result=reorderWorkflowRows(rows,order,source,target,placement==='after');
 return result.error?result:{...result,tasks:updated};
}
