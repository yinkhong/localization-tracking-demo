import {workflowOrder} from './status.jsx';

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
