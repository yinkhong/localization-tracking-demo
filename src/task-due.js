const instant=value=>value==null?NaN:new Date(value).getTime();

export function updateTaskDueDates(tasks,ids,due,timestamp){
 const selected=new Set(ids);
 const byId=new Map(tasks.map(task=>[task.id,task]));
 const changes=new Set(selected);
 const overwritten=new Set();
 for(const task of tasks){
  if(selected.has(task.id)&&task.parentTask&&!due){
   return {error:'Subtasks need a due date. Use the parent’s deadline or an earlier time.'};
  }
  const seen=new Set([task.id]);
  for(let parent=byId.get(task.parentTask);parent&&!seen.has(parent.id);parent=byId.get(parent.parentTask)){
   seen.add(parent.id);
   if(selected.has(parent.id)){
    changes.add(task.id);
    if(task.due!=null&&(due==null||instant(task.due)!==instant(due)))overwritten.add(task.id);
    break;
   }
   if(selected.has(task.id)&&parent.due!=null&&instant(due)>instant(parent.due)){
    return {error:'A subtask’s due date cannot be later than its parent’s ('+parent.id+').'};
   }
  }
 }
 return {overwritten:[...overwritten],tasks:tasks.map(task=>
  changes.has(task.id)&&(due==null?task.due!=null:instant(task.due)!==instant(due))?
   {...task,due,modifiedAt:timestamp}:task)};
}
