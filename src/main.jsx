import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {demoRequests,demoTasks,demoDefects,estimate,formatMinutes,operatorRanking,zones} from './data';
import {audit, bootstrapTimeline, Metadata, patchRecord, ResourceTimeline, SessionList, TimelineAdmin, timelineRoles} from './timeline';
import {ActivityLog, bootstrapWorkflow, demoProfiles, FileWorkflows, InlineDue, TaskStatus, TaskTypePicker, withActivity, ZonedInput} from './workflow';
import {blockedTask, bootstrapStatuses, dependencyError, dependencyIds, parentTaskIds, resolveTasks, StatusAdmin, StatusPicker, statusColor, statusGroup, workflowOrder} from './status';
import {DefectForm, RcaBody} from './rca';
import {Acknowledgment, bootstrapDefects, defectAttribution, defectChanges, DefectPerformance, defectSeverities, defectStatuses, canEditDefect, RcaTimeline, ReviewSelect, reviewRoles} from './defect-review';
import {formatZoned, zoneCode} from './time-zone';
import {TaskRelationships, updateRelationships} from './task-relations';
import {Reporting} from './reporting';
import {defaultTaskTypes,LabelCatalog,TaskTypeAdmin} from './task-types';
import {moveWorkflowTask} from './workflow-order';
import {defaultTeamGroups,TeamOrg} from './team-org';
import {normalizeTeamGroups,teamMembers} from './team-memberships';
import {Productivity,ShiftSettings} from './productivity';
import {defaultShift,isCancelled} from './productivity-data';
import {Breaks,CorrectTime,TodayBreaks} from './time-entry-ui';
import {correctTaskTime,defaultCorrectionAccess,planBreak,todayBreaks} from './time-entry';
import {useFloatingTimer} from './floating-timer';
import './style.css';

const sections=[['Overview','◫'],['Requests','▤'],['Planning','▦'],['My work','✓'],['Defects','◇'],['Reporting','▥'],['Productivity','▧'],['Teams','♧']];
const palette={'In progress':'blue','Under review':'blue','Ready':'green','On track':'green','Complete':'green','Trained':'green','Fits':'green','At risk':'red','Major':'red','Waiting':'amber','Paused':'amber','Does not fit':'amber','Open':'amber','Unscheduled':'gray','Closed':'green','Historical':'blue','Page-based':'green'};
const badge = name => <span className={'badge '+(palette[name]||'gray')}><i/>{name}</span>;
const clock = n => [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');
const defaultAccounts=['Account A','Account B','Account C'].map(id=>({id,label:id}));
const dataKey='localization-workspace-v1';
function load(){
 try{
  const value=JSON.parse(localStorage.getItem(dataKey));
  if(value?.requests&&value?.tasks&&value?.defects)return bootstrapDefects(bootstrapStatuses(bootstrapWorkflow(bootstrapTimeline({...value,teamGroups:normalizeTeamGroups(value.teamGroups??defaultTeamGroups)},false))));
 }catch{}
 return bootstrapDefects(bootstrapStatuses(bootstrapWorkflow(bootstrapTimeline({requests:demoRequests,tasks:demoTasks,defects:demoDefects,teamGroups:defaultTeamGroups,zone:'Pacific',active:null},true))));
}
function App(){
 const [state,setState]=useState(load),[view,setView]=useState(()=>state.profiles[state.profile].role==='Operator'?'My work':'Overview'),[record,setRecord]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[dialog,setDialog]=useState(null),[notice,setNotice]=useState(''),[workflowError,setWorkflowError]=useState(''),[now,setNow]=useState(Date.now()),[mode,setMode]=useState('Table'),[projectTab,setProjectTab]=useState('Tasks'),[adminSection,setAdminSection]=useState('');
 const {requests,tasks:allTasks,defects,timelineAccess,activityAccess,activeTimers,profile,profiles,workflowFiles,activity,statuses,requestStatuses,taskTypes=defaultTaskTypes,workflowOrders={},teamGroups=defaultTeamGroups,accounts=defaultAccounts}=state;
 const {role,zone,autoFloatTaskTimer=true}=profiles[profile];
 const archivedFiles=new Set(workflowFiles.filter(file=>file.archivedAt).map(file=>file.id));
 const tasks=allTasks.filter(task=>!archivedFiles.has(task.fileId));
 const shifts=state.shifts??{}, timeOff=state.timeOff??{};
 const correctionAccess=state.correctionAccess??defaultCorrectionAccess;
 const breakPlans=state.breakPlans??{},breakLogs=state.breakLogs??{},activeBreaks=state.activeBreaks??{};
 const activeBreak=activeBreaks[profile];
 const anyBreak=Object.keys(activeBreaks).length>0;
 const shiftDefaults=Object.fromEntries(Object.keys(profiles).map(name=>[name,defaultShift(demoProfiles[name]?.zone??profiles[name].zone)]));
 const active=activeTimers[profile];
 const timers=Object.values(activeTimers);
 const isRunning=id=>timers.some(timer=>timer.id===id);
 const parents=parentTaskIds(tasks);
 const phase=id=>statusGroup(statuses,id);
 const statusBadge=(id,catalog=statuses)=><span className={'badge '+statusColor(statusGroup(catalog,id))} title={statusGroup(catalog,id)}><i/>{catalog.find(status=>status.id===id)?.label??id}</span>;
 const typeLabel=id=>taskTypes.find(type=>type.id===id)?.label??id;
 const canReview=reviewRoles.includes(role);
 const reviewers=Object.keys(profiles).filter(name=>reviewRoles.includes(profiles[name].role));
 const canSeeActivity=Boolean(activityAccess[role]);
 const canManage = role !== 'Operator';
 const canSeeResources = Boolean(timelineAccess[role]);
 const people = Object.keys(profiles);
 const shiftEditors=role==='Manager'?people:role==='Team lead'?
  [...new Set(teamGroups.filter(group=>group.lead===profile).flatMap(group=>group.kind==='team'?teamMembers(teamGroups,group.team):group.members))]:[];
 const accountLabel=id=>accounts.find(account=>account.id===id)?.label??id;
 useEffect(()=>{try{localStorage.setItem(dataKey,JSON.stringify(state));}catch{setNotice('Browser storage is full. These changes are available for this session.');}},[state]);
 useEffect(()=>{
  if(!['Productivity','Profile','My work'].includes(view)&&!Object.keys(activeTimers).length&&!anyBreak)return;
  setNow(Date.now());
  const id=setInterval(()=>setNow(Date.now()),Object.keys(activeTimers).length||anyBreak?1000:10000);
  return()=>clearInterval(id);
 },[activeTimers,view,anyBreak]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{const close=e=>{if(e.key==='Escape')setDialog(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 const displayTime={hour:'2-digit',minute:'2-digit',hourCycle:'h23'};
 const historyDate=value=>formatZoned(value,zone,{...displayTime,year:'numeric',month:'short',day:'numeric',second:'2-digit'});
 const date=value=>formatZoned(value,zone,{...displayTime,month:'short',day:'numeric'});
 const short=value=>formatZoned(value,zone,displayTime);
 const navigate=(next,id='')=>{setDialog(null);setWorkflowError('');setView(next);setRecord(id);setFilter('All');setQuery('');setProjectTab('Tasks');window.scrollTo(0,0);};
 useEffect(()=>{if(view==='Admin'&&adminSection)document.getElementById(adminSection)?.scrollIntoView();},[view,adminSection]);
 function openAdmin(id){setAdminSection(id);navigate('Admin');}
 const editTaskStatuses=role==='Manager'?()=>openAdmin('task-status-labels'):undefined;
 const editAccounts=role==='Manager'?()=>openAdmin('account-labels'):undefined;
 const editTaskTypes=role==='Manager'?()=>openAdmin('task-types'):undefined;
 const requestOf=id=>requests.find(r=>r.id===id);
 const taskOf=id=>allTasks.find(t=>t.id===id);
 const req=requestOf(record), task=taskOf(record), defect=defects.find(d=>d.id===record);
 const defectEntries=defect?activity.filter(entry=>entry.recordId===defect.id&&entry.recordName==='Defect'):[];
 const defectLocked=defect?.status==='Closed';
 const requestTasks=req?tasks.filter(t=>t.request===req.id):[];
 const requestFiles=req?workflowFiles.filter(f=>f.request===req.id&&!f.archivedAt):[];
 const removedFiles=req?workflowFiles.filter(f=>f.request===req.id&&f.archivedAt):[];
 const activeTask=active&&taskOf(active.id);
 const elapsed=activeTask?(activeTask.spent??0)+Math.max(0,Math.floor((now-active.started)/1000)):0;
 const taskTimerKey=(id,started)=>'task:'+profile+':'+id+':'+started;
 const breakTimerKey=id=>'break:'+profile+':'+id;
 const floating=useFloatingTimer(activeTask?{
  key:taskTimerKey(activeTask.id,active.started),title:'Task timer',name:activeTask.file,
  detail:typeLabel(activeTask.type)+' · '+activeTask.id,started:active.started,spent:activeTask.spent??0,
  elapsedLabel:'Elapsed task time',pause:()=>stop(),finish:()=>stop(true),finishLabel:'Complete',
 }:activeBreak?{
  key:breakTimerKey(activeBreak.id),title:'Break timer',name:'On break',started:activeBreak.start,spent:0,
  elapsedLabel:'Elapsed break time',finish:endBreak,finishLabel:'End break',
 }:null,clock);
 const dailyBreaks=todayBreaks(breakLogs[profile]??[],now,zone,toInstant);
 const taskBlocked=(task,all=tasks)=>blockedTask(task,all,statuses);
 const stats=[['Open requests',requests.filter(r=>statusGroup(requestStatuses,r.status)!=='Complete').length,'Across all sample accounts','▤'],['At risk',requests.filter(r=>r.risk==='At risk').length,'Needs PM attention','!'],['Ready to assign',tasks.filter(t=>!parents.has(t.id)&&phase(t.status)==='To-do'&&!taskBlocked(t)&&!t.person).length,'Unassigned operations','＋'],['Defects in review',defects.filter(d=>d.status!=='Closed').length,'Awaiting a decision','◇']];
 const editable=t=>canManage||t?.person===profile;
 function moveTask(file,source,target,placement){
  if(!canManage)return;
  const timestamp=Date.now();
  const result=moveWorkflowTask(tasks,file,workflowOrders[file],source,target,placement,statuses,timers,timestamp);
  if(result.error){setWorkflowError(result.error);return;}
  if(!result.order)return;
  setWorkflowError('');
  commit('Moved workflow task',(s,at)=>{
   const updated=moveWorkflowTask(s.tasks,file,s.workflowOrders?.[file],source,target,placement,s.statuses,Object.values(s.activeTimers),at);
   return updated.error||!updated.order?s:{...s,tasks:updated.tasks,workflowOrders:{...s.workflowOrders,[file]:updated.order}};
  },timestamp);
  setNotice('Workflow position saved');
 }
 function saveRelationships(changes){
  const result=updateRelationships(tasks,task.id,changes,statuses,timers,Date.now());
  if(result.error){setWorkflowError(result.error);return;}
  setWorkflowError('');
  commit('Updated workflow relationships',(s,timestamp)=>{
   const updated=updateRelationships(s.tasks,task.id,changes,s.statuses,Object.values(s.activeTimers),timestamp);
   return updated.error?s:{...s,tasks:updated.tasks};
  });
  setNotice('Relationships saved');
 }
 const taskIsParent=task&&parents.has(task.id);
 const canAddSubtask=task=>!isRunning(task.id)&&!(phase(task.status)==='Complete'&&tasks.some(
  item=>phase(item.status)!=='To-do'&&dependencyIds(item,tasks).includes(task.id)));
 function addSubtask(file,parent){
  if(!canManage||!file||file.archivedAt)return;
  if(!canAddSubtask(parent)){setNotice('Finish the active timer or downstream work before changing this workflow.');return;}
  setDialog({kind:'newtask',request:parent.request,file,parent});
 }
 function updateFile(file,action,name=''){
  if(!canManage)return;
  const nextName=name.trim();
  if(action==='rename'&&!nextName){setNotice('Enter a file name.');return;}
  const nameToCheck=action==='restore'?file.name:nextName;
  if(action!=='delete'&&workflowFiles.some(item=>item.id!==file.id&&item.request===file.request&&
    !item.archivedAt&&item.name.toLowerCase()===nameToCheck.toLowerCase())){
   setNotice('A file with that name is already on this request.');return;
  }
  if(action==='delete'&&allTasks.some(task=>task.fileId===file.id&&isRunning(task.id))){
   setNotice('Pause all running timers on this file before deleting it.');return;
  }
  const label={rename:'Renamed file',delete:'Deleted file',restore:'Restored file'}[action];
  commit(label,(s,timestamp)=>{
   const files=s.workflowFiles.map(item=>item.id!==file.id?item:patchRecord(item,
    action==='rename'?{name:nextName}:{archivedAt:action==='delete'?timestamp:null},timestamp));
   return {...s,workflowFiles:files,tasks:action==='rename'?s.tasks.map(task=>task.fileId===file.id?
    patchRecord(task,{file:nextName},timestamp):task):s.tasks};
  });
  setDialog(null);setNotice(label);
 }
 function predecessorChoices(file,parent){
  const byId=new Map(tasks.map(task=>[task.id,task]));
  function reachesParent(id,seen=new Set()){
   if(!parent||!id||seen.has(id))return false;
   if(id===parent.id)return true;
   seen.add(id);
   const item=byId.get(id);
   return item&&dependencyIds(item,tasks).some(predecessor=>reachesParent(predecessor,seen));
  }
  return tasks.filter(task=>task.fileId===file.id&&!reachesParent(task.id));
 }
 function commit(action, update, timestamp=Date.now()){
  setState(s=>{
   const updated=update(s,timestamp);
   if(updated===s)return s;
   const before=new Map(s.tasks.map(task=>[task.id,task]));
   const completed=task=>task&&statusGroup(updated.statuses,task.status)==='Complete'&&!isCancelled(task,updated.statuses);
   const next=updated.tasks===s.tasks?updated:{...updated,tasks:resolveTasks(updated.tasks,updated.statuses,timestamp).map(task=>{
    const old=before.get(task.id);
    if(completed(task)&&!completed(old))return {...task,completedAt:timestamp,completedBy:task.person};
    if(!completed(task)&&old?.completedAt)return {...task,completedAt:null,completedBy:null};
    return task;
   })};
   return withActivity(s,next,profile,timestamp,action);
  });
 }
 function updateDefect(id,fields,action='edit',label='Updated defect report'){
  commit(label,(s,timestamp)=>{
   const current=s.defects.find(item=>item.id===id);
   if(!current)return s;
   const changes=defectChanges(current,fields,{profile,role,profiles:s.profiles,requests:s.requests,tasks:s.tasks,timestamp,teamGroups:s.teamGroups},action);
   if(!changes||!Object.keys(changes).length)return s;
   return {...s,defects:s.defects.map(item=>item===current?patchRecord(item,changes,timestamp,'assignedTo'):item)};
  });
 }
 function saveDefect(values){
  const existing=dialog.existing;
  const id=existing?.id||'DF-'+String(Math.max(87,...defects.map(d=>Number(d.id.split('-')[1])))+1).padStart(4,'0');
  if(existing){
   if(!canEditDefect(existing,profile,role))return;
   updateDefect(id,values,'edit',values.status!==existing.status&&values.status==='Closed'?'Closed defect report':'Updated defect report');
  }else{
   commit('Created defect report',(s,timestamp)=>({...s,defects:[{
    ...values,id,revision:1,acknowledgments:[],...defectAttribution(values.request,values.task,s.requests,s.tasks,s.teamGroups),
    ...audit(timestamp,profile,Boolean(values.assignedTo)),
   },...s.defects]}));
  }
  navigate('Defect',id);setNotice('RCA report saved');
 }
 function changeProfilePreference(update){
  setState(s=>({...s,profiles:{...s.profiles,[profile]:{...s.profiles[profile],...update}}}));
 }
 function changeTask(id,fields){
  const current=taskOf(id);
  if(!current||archivedFiles.has(current.fileId))return;
  const typeBranch=fields.type?taskBranch(current.id,tasks):[];
  if(fields.type&&(current.parentTask||typeBranch.some(item=>item.type!==fields.type&&isRunning(item.id)))){
   setWorkflowError('Change the parent task type after pausing work in this branch.');return;
  }
  const error=fields.status&&phase(fields.status)!=='To-do'&&dependencyError(current,tasks,statuses);
  if(error){setWorkflowError(error);return;}
  if(fields.status&&phase(current.status)==='Complete'&&phase(fields.status)!=='Complete'){
   const reopened=resolveTasks(tasks.map(item=>item.id===id?{...item,status:fields.status}:item),statuses,Date.now());
   if(reopened.some(item=>phase(item.status)!=='To-do'&&taskBlocked(item,reopened)&&!taskBlocked(taskOf(item.id)))){
    setWorkflowError('This task cannot reopen while downstream work has already started.');return;
   }
  }
  setWorkflowError('');
  const action=Object.hasOwn(fields,'pages')?'Updated page count':Object.hasOwn(fields,'person')?'Changed assignee':Object.hasOwn(fields,'status')?'Changed status':'Updated task';
  commit(action,(s,timestamp)=>{
   const task=s.tasks.find(item=>item.id===id);
   if(!task||!editable(task))return s;
   if(fields.type&&!(s.taskTypes??defaultTaskTypes).some(type=>type.id===fields.type))return s;
   if(!canManage&&Object.keys(fields).some(key=>!['pages','status'].includes(key)))return s;
   if(Object.values(s.activeTimers).some(timer=>timer.id===id)&&
      ['person','type','status'].some(key=>Object.hasOwn(fields,key)))return s;
   if(parentTaskIds(s.tasks).has(id)&&['person','status'].some(key=>Object.hasOwn(fields,key)))return s;
   if(fields.status&&(!phase(fields.status)||(taskBlocked(task,s.tasks)&&phase(fields.status)!=='To-do')))return s;
   if(!fields.type&&Object.entries(fields).every(([key,value])=>(task[key]??null)===(value??null)))return s;
   const branch=new Set(typeBranch.map(item=>item.id));
   const changed=s.tasks.map(item=>item.id===id?patchRecord(item,
    Object.hasOwn(fields,'pages')?{...fields,pagesManual:true}:fields,timestamp,'person'):
    branch.has(item.id)&&item.type!==fields.type?patchRecord(item,{type:fields.type},timestamp):item);
   const updated=fields.pages!=null?copyFirstPageCount(changed,task.fileId,id,s.workflowOrders?.[task.fileId],timestamp):changed;
   const attributed=fields.person?s.defects.map(report=>report.task===id&&!report.operator&&report.status!=='Closed'?
    patchRecord(report,defectAttribution(report.request,id,s.requests,updated,s.teamGroups),timestamp):report):s.defects;
   return {...s,tasks:updated,defects:attributed};
  });
 }
 function start(task){
  if(task.person!==profile||parents.has(task.id)||phase(task.status)==='Complete')return;
  if(activeBreak){setWorkflowError('End your break before starting a task timer.');return;}
  const error=dependencyError(task,tasks,statuses);
  if(error){setWorkflowError(error);return;}
  setWorkflowError('');
  if(active){if(active.id!==task.id)setDialog({kind:'timer',target:task});return;}
  if(isRunning(task.id))return;
  const timestamp=Date.now();
  if(autoFloatTaskTimer)floating.open(taskTimerKey(task.id,timestamp),'Task timer');
  const openedWith=task.status==='Paused'?'Resumed':'Started';
  setNow(timestamp);
  commit(openedWith==='Resumed'?'Resumed timer':'Started timer',(s,started)=>{
   const current=s.tasks.find(item=>item.id===task.id);
   if(current?.person!==profile||s.activeTimers[profile]||s.activeBreaks?.[profile]||
      Object.values(s.activeTimers).some(timer=>timer.id===task.id))return s;
   return {...s,activeTimers:{...s.activeTimers,[profile]:{id:task.id,started,operator:profile,openedWith}},
    tasks:s.tasks.map(item=>item.id===task.id?patchRecord(item,{status:phase(item.status)==='In progress'&&item.status!=='Paused'?item.status:'In progress'},started):item)};
  },timestamp);
  setNotice(openedWith==='Resumed'?'Timer resumed':'Timer started');
 }
 function stop(complete=false){
  if(!active)return;
  commit(complete?'Completed task':'Paused timer',(s,endedAt)=>{
   const running=s.activeTimers[profile];
   if(!running)return s;
   const {[profile]:closed,...activeTimers}=s.activeTimers;
   const updated=s.tasks.map(t=>{
    if(t.id!==running.id)return t;
    const duration=Math.max(0,Math.floor((endedAt-running.started)/1000));
    const session={startedAt:running.started,endedAt,operator:profile,
     openedWith:running.openedWith??'Started',closedWith:complete?'Completed':'Paused'};
    return patchRecord(t,{spent:(t.spent??0)+duration,sessions:[...(t.sessions??[]),session],
     status:complete?'Complete':'Paused'},endedAt);
   });
   return {...s,activeTimers,tasks:updated};
  });
  setDialog(null);setNotice(complete?'Task completed':'Timer paused');
 }
 function saveCorrection(values){
  const timestamp=Date.now();
  const check=correctTaskTime(state,task.id,values,profile,timestamp);
  if(check.error)return check.error;
  commit('Corrected work time',s=>correctTaskTime(s,task.id,values,profile,timestamp).state??s,timestamp);
  setNotice('Work time correction saved');
 }
 function bookBreak(start,end){
  const timestamp=Date.now(),id=crypto.randomUUID();
  const error=planBreak(breakPlans[profile]??[],start,end,timestamp);
  if(error)return error;
  setState(s=>{
   const plans=s.breakPlans?.[profile]??[];
   if(planBreak(plans,start,end,timestamp))return s;
   return {...s,breakPlans:{...s.breakPlans,[profile]:[...plans,{id,start,end}]}};
  });
  setNotice('Break booked');
 }
 function cancelBreak(id){
  setState(s=>{
   if(s.activeBreaks?.[profile]?.booking===id)return s;
   return {...s,breakPlans:{...s.breakPlans,[profile]:(s.breakPlans?.[profile]??[]).filter(plan=>plan.id!==id||plan.used)}};
  });
 }
 function startBreak(booking=null){
  if(active){setWorkflowError('Pause or complete your task timer before starting a break.');return;}
  if(activeBreak||booking&&!breakPlans[profile]?.some(plan=>plan.id===booking&&!plan.used))return;
  setWorkflowError('');
  const start=Date.now(),id=crypto.randomUUID();
  floating.open(breakTimerKey(id),'Break timer');
  setNow(start);
  setState(s=>{
   if(s.activeTimers[profile]||s.activeBreaks?.[profile])return s;
   if(booking&&!s.breakPlans?.[profile]?.some(plan=>plan.id===booking&&!plan.used))return s;
   return {...s,activeBreaks:{...s.activeBreaks,[profile]:{id,start,booking}}};
  });
 }
 function endBreak(){
  const end=Date.now();
  setWorkflowError('');
  setState(s=>{
   const running=s.activeBreaks?.[profile];
   if(!running)return s;
   const {[profile]:removed,...activeBreaks}=s.activeBreaks;
   const logged=[...(s.breakLogs?.[profile]??[]),{...running,end:Math.max(running.start,end)}];
   const plans=(s.breakPlans?.[profile]??[]).map(plan=>plan.id===running.booking?{...plan,used:true}:plan);
   return {...s,activeBreaks,breakLogs:{...s.breakLogs,[profile]:logged},breakPlans:{...s.breakPlans,[profile]:plans}};
  });
  setNotice('Break recorded');
 }
 const search=(...vals)=>vals.join(' ').toLowerCase().includes(query.toLowerCase());
 const riskSummary = requests.filter(r=>r.risk==='At risk');
 const selectFilter = options => <select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select>;
 const searchInput = placeholder => <input className="search" aria-label={placeholder} placeholder={placeholder} value={query} onChange={e=>setQuery(e.target.value)}/>;
 const tabs = (values,selected,onSelect) => <div className="segments">{values.map(v=><button key={v} aria-pressed={selected===v} className={selected===v?'selected':''} onClick={()=>onSelect(v)}>{v}</button>)}</div>;
 function taskAction(t){
  if(active?.id===t.id)return <button onClick={()=>stop()}>Pause</button>;
  if(parents.has(t.id)||phase(t.status)==='Complete'||!editable(t))return <button onClick={()=>navigate('Task',t.id)}>View</button>;
  if(taskBlocked(t)&&t.person!==profile)return <button onClick={()=>navigate('Task',t.id)}>View</button>;
  if(t.person&&t.person!==profile)return <button onClick={()=>navigate('Task',t.id)}>View</button>;
  if(!t.person)return <button onClick={()=>setDialog({kind:'rank',task:t})}>Suggest operator</button>;
  return <button onClick={()=>start(t)}>{t.status==='Paused'?'Resume':'Start timer'}</button>;
 }
 function requestTable(items){
  return <div className="table-wrap"><table><thead><tr><th>Request</th><th>Account</th><th>Due</th><th>Forecast</th><th>Status</th><th>Delivery risk</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td><button className="link record" onClick={()=>navigate('Request',r.id)}>{r.title}</button><small>{r.id} · {r.files} files</small></td><td>{accountLabel(r.account)}</td><td>{date(r.due)}</td><td>{date(r.forecast)}</td><td>{statusBadge(r.status,requestStatuses)}</td><td>{badge(r.risk)}</td></tr>)}</tbody></table>{!items.length&&<div className="empty">No matching requests.</div>}</div>;
 }
 function taskTable(items){
  return <div className="table-wrap"><table><thead><tr><th>File / operation</th><th>Assignee</th><th>Due</th><th>Effort</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map(t=>{const e=estimate(requestOf(t.request)?.account,t.type,t.pages);return <tr key={t.id}><td><button className="link record" onClick={()=>navigate('Task',t.id)}>{t.file}</button><small>{t.parentTask?'Subtask · ':''}{typeLabel(t.type)} · {t.id}</small></td><td>{parents.has(t.id)?'Subtasks only':t.person||'Unassigned'}</td><td>{date(t.due)}</td><td>{parents.has(t.id)?'—':formatMinutes(e.minutes)}{!parents.has(t.id)&&e.source==='Historical'&&<small>Historical</small>}</td><td>{statusBadge(t.status)}</td><td>{taskAction(t)}</td></tr>;})}</tbody></table>{!items.length&&<div className="empty">No matching tasks.</div>}</div>;
 }
 function defectTable(items){
 return <div className="table-wrap"><table><thead><tr><th>Finding</th><th>Related request</th><th>Severity</th><th>Status</th></tr></thead><tbody>{items.map(d=><tr key={d.id}><td><button className="link record" onClick={()=>navigate('Defect',d.id)}>{d.title}</button><small>{d.id}</small></td><td><button className="link" onClick={()=>navigate('Request',d.request)}>{d.request}</button></td><td>{badge(d.severity)}</td><td>{badge(d.status)}</td></tr>)}</tbody></table>{!items.length&&<div className="empty">No findings to show.</div>}</div>;
 }
 const primaryNav=sections.filter(([name])=>name==='Productivity'?role==='Manager':
  canManage||['Requests','My work','Defects'].includes(name)||canSeeResources&&name==='Planning');
 const heading={Productivity:['Team productivity','Review completed tasks, scheduled work, and shift utilization.'],Profile:[profile+'’s profile','Review recorded work sessions in your selected time zone.'],Teams:['Team organization','View team leads, subteams, and operator assignments.'],Reporting:['Reporting','Review request and task records saved in this workspace.'],Admin:['Admin console','Manage demo role permissions.'],Overview:['Delivery overview','Monitor commitments, available work, and quality in one place.'],Requests:['Requests','Manage project intake, effort estimates, and delivery commitments.'],Planning:['Team dispatch','Review ready work and choose an available operator.'],'My work':['My work','Review your assignments and record active work.'],Defects:['Escalations & defects','Review findings and trace them to the affected work.'],Request:[req?.title,req?.id+' · '+accountLabel(req?.account)],Task:[task?.file,task?.id+' · '+typeLabel(task?.type)],Defect:[defect?.title,defect?.id+' · Defect report']}[view];
 const relatedRequest=req??requestOf(task?.request??defect?.request);
 const trail=[['Workspace',role==='Operator'?'My work':'Overview','']];
 if(relatedRequest){
  trail.push(['Requests','Requests','']);
  trail.push([relatedRequest.title,'Request',relatedRequest.id]);
  const currentTask=task??taskOf(defect?.task);
  const chain=[],seen=new Set();
  for(let step=currentTask;step&&!seen.has(step.id);step=taskOf(step.parentTask)){
   seen.add(step.id);chain.unshift([typeLabel(step.type)+' · '+step.id,'Task',step.id]);
  }
  trail.push(...chain);
 }
 if((!relatedRequest&&view!=='Overview')||view==='Defect')trail.push([view,view,record]);
 return <div className="app">
 <aside className="sidebar"><div className="brand"><span className="logo">L</span><span>Production<br/><small>Localization workspace</small></span></div>
 <nav aria-label="Main navigation">{primaryNav.map(([name,icon])=><button key={name} className={(view===name||view==='Request'&&name==='Requests'||view==='Profile'&&name==='My work'||view==='Task'&&name===(role==='Operator'?'My work':'Requests')||view==='Defect'&&name==='Defects')?'current':''} onClick={()=>navigate(name)}><span>{icon}</span>{name}</button>)}</nav>
 <div className="sidebar-bottom">{role==='Manager'&&<button className="sidebar-link" onClick={()=>navigate('Admin')}>Admin console</button>}
 <button className="account" onClick={()=>navigate('Profile')} aria-label={'Open '+profile+'’s profile'}><span className="avatar">{profile[0]}</span><span><strong>{profile}</strong><small>{role} · Demo</small></span></button></div>
 </aside>
 <div className="body">
 <header className="top"><nav className="crumb" aria-label="Breadcrumb"><ol>{trail.map(([label,page,id],index)=>
  <li key={page+id}>{index===trail.length-1?<span aria-current="page">{label}</span>:
   <button type="button" className="link" onClick={()=>navigate(page,id)}>{label}</button>}</li>)}</ol></nav><div className="controls"><span className="demo-tag">Sample data</span><label>Profile <select value={profile} onChange={e=>{
 const name=e.target.value;setDialog(null);setState(s=>({...s,profile:name}));
 navigate(profiles[name].role==='Operator'?'My work':'Overview');
 }}>{Object.keys(demoProfiles).map(name=><option key={name}>{name}</option>)}</select></label>
 <label>Role <select value={role} onChange={e=>{const r=e.target.value;setDialog(null);changeProfilePreference({role:r});navigate(r==='Operator'?'My work':'Overview');}}>{timelineRoles.map(x=><option key={x}>{x}</option>)}</select></label><label>Time zone <select value={zone} onChange={e=>changeProfilePreference({zone:e.target.value})}>{Object.keys(zones).map(z=><option key={z} value={z}>{zoneCode(z,now)}</option>)}</select></label></div></header>
 <main>
 {dialog?.kind==='defect'?<>
  <div className="heading"><div><h1>{dialog.existing?'Edit RCA report':'New RCA report'}</h1></div></div>
  <DefectForm key={dialog.existing?.id||'new'} requests={requests} tasks={tasks} config={dialog}
   save={saveDefect} {...{reviewers,canReview,typeLabel,accountLabel,teamGroups}} cancel={()=>setDialog(null)}/>
 </>:<>
 {['Request','Task','Defect'].includes(view)&&<button className="link back" onClick={()=>navigate(view==='Request'?'Requests':view==='Task'?(task?.parentTask?'Task':role==='Operator'?'My work':'Request'):'Defects',task?.parentTask||task?.request)}>‹ Back</button>}
 <div className="heading"><div><h1>{heading?.[0]}</h1>
 {view==='Request'&&req&&<div className="request-heading-status">
  <div><small>Request status</small>{canManage?<StatusPicker label="Request status"
   statuses={requestStatuses} value={req.status}
   onEdit={role==='Manager'?()=>openAdmin('request-status-labels'):undefined} editLabel="Edit request status labels"
   onChange={status=>commit('Changed request status',(s,timestamp)=>({...s,requests:s.requests.map(r=>r.id===req.id?patchRecord(r,{status},timestamp):r)}))}/>:statusBadge(req.status,requestStatuses)}</div>
  <div><small>Estimated project completion</small><span className="completion-status">{badge(req.risk)} {req.forecast&&<strong>{date(req.forecast)}</strong>}</span></div>
 </div>}
 <p>{heading?.[1]}</p></div>{(['Overview','Requests'].includes(view)&&role!=='Operator')&&<button className="primary" onClick={()=>setDialog({kind:'request'})}>＋ New request</button>}{view==='Defects'&&<button className="primary" onClick={()=>setDialog({kind:'defect'})}>＋ New report</button>}</div>
 {workflowError&&<div className="workflow-error" role="alert"><span>{workflowError}</span><button aria-label="Dismiss error" onClick={()=>setWorkflowError('')}>Dismiss</button></div>}
 {activeTask&&<div className="timer"><div>{badge('In progress')} <button className="link" onClick={()=>navigate('Task',activeTask.id)}>{activeTask.file} · {typeLabel(activeTask.type)}</button></div>
 <div><strong>{clock(elapsed)}</strong>
  {floating.control}
  <button onClick={()=>stop()}>Pause</button><button className="primary" onClick={()=>stop(true)}>Complete</button>
 </div></div>}
 {activeBreak&&view!=='My work'&&<div className="timer"><div>{badge('On break')}</div>
  <div><strong>{clock(Math.max(0,Math.floor((now-activeBreak.start)/1000)))}</strong>{floating.control}<button onClick={endBreak}>End break</button></div>
 </div>}
 {floating.card}
 {view==='Overview'&&<>
 <div className="metrics">{stats.map(([label,value,detail,icon])=><div className="metric" key={label}><div className="metric-top"><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{detail}</small></div>)}</div>
 <div className="overview-grid"><section className="panel chart"><div className="panel-header"><div><h2>Quality trend</h2><p>Confirmed defects per 100 inspected pages</p></div><span className="subtle">Last 4 weeks</span></div><div className="bars" aria-label="Example quality trend: 1.2, 0.9, 0.7, 0.6"><div className="chart-grid"/>{[1.2,.9,.7,.6].map((v,i)=><div className="bar-column" key={i}><div style={{height:(v/1.2)*86+'%'}} className="chart-bar"><span>{v.toFixed(1)}</span></div><small>Week {i+1}</small></div>)}</div></section>
 <section className="panel attention"><div className="panel-header"><div><h2>Needs attention</h2><p>Delivery risks and next actions</p></div></div>{riskSummary.map(r=><div className="attention-item" key={r.id}><div><button className="link record" onClick={()=>navigate('Request',r.id)}>{r.title}</button><small>{r.id} · Due {date(r.due)}</small></div>{badge('At risk')}</div>)}<div className="attention-item"><div><button className="link record" onClick={()=>navigate('Planning')}>Unassigned work</button><small>Review available operators</small></div>{badge('Ready')}</div><div className="attention-item"><div><button className="link record" onClick={()=>navigate('Defects')}>Defect review queue</button><small>Open related evidence and tasks</small></div>{badge('Under review')}</div></section></div>
 <section className="panel"><div className="panel-header"><h2>Recent requests</h2><button onClick={()=>navigate('Requests')}>View all requests</button></div>{requestTable(requests.slice(0,4))}</section></>}
 {view==='Productivity'&&role==='Manager'&&<Productivity tasks={allTasks} shifts={{...shiftDefaults,...shifts}} {...{timers,statuses,now,teamGroups,profiles,zone,toInstant,navigate,typeLabel,archivedFiles,timeOff,breakPlans,breakLogs,activeBreaks}}/>}
 {view==='Reporting'&&canManage&&<Reporting taskStatuses={statuses} {...{requests,tasks,requestStatuses,taskTypes,people,typeLabel,date,zone,navigate,teamGroups,accountLabel}}/>}
 {view==='Overview'&&role==='Manager'&&<DefectPerformance records={defects} profiles={profiles} groups={teamGroups} accountLabel={accountLabel}/>}
 {view==='Requests'&&<section className="panel"><div className="panel-header filters">{searchInput('Search requests')}{selectFilter(['All','At risk','On track','Unscheduled'])}</div>{requestTable(requests.filter(r=>search(r.title,r.id,accountLabel(r.account))&&(filter==='All'||r.risk===filter)))}</section>}
 {view==='Request'&&req&&<><section className="panel summary"><div><small>Account</small>{canManage?<AccountPicker
  value={req.account} accounts={accounts} onEdit={editAccounts} onChange={account=>{
   if(account===req.account)return;
   commit('Changed request account',(s,timestamp)=>({...s,requests:s.requests.map(item=>item.id===req.id?patchRecord(item,
    {account,initialMinutes:null,forecast:null,risk:'Unscheduled'},timestamp):item)}));
  }}/>:<strong>{accountLabel(req.account)}</strong>}</div><div><small>Project owner</small>{canManage?<select aria-label="Project owner" value={req.owner||''} onChange={e=>{
 const owner=e.target.value;
 commit('Changed project owner',(s,timestamp)=>({...s,requests:s.requests.map(r=>r.id===req.id?patchRecord(r,{owner},timestamp,'owner'):r)}));
 }}><option value="">Unassigned</option>{people.map(person=><option key={person}>{person}</option>)}</select>:<strong>{req.owner||'Unassigned'}</strong>}</div><div><small>Due</small><strong>{date(req.due)}</strong></div><div><small>Estimated active effort</small><strong>{formatMinutes(req.initialMinutes)}</strong></div></section>
 <div className="panel-header request-toolbar">
 {tabs(['Files & workflows','Escalations & defects',...(canSeeActivity?['Activity log']:[])],projectTab==='Tasks'?'Files & workflows':projectTab,setProjectTab)}
 {projectTab==='Escalations & defects'&&<button onClick={()=>setDialog({kind:'defect',request:req.id})}>New report</button>}
 {canManage&&['Tasks','Files & workflows'].includes(projectTab)&&<button className="primary" onClick={()=>setDialog({kind:'newfile',request:req.id})}>＋ Add file</button>}
 </div>
 {projectTab==='Activity log'&&canSeeActivity&&<ActivityLog key={req.id} entries={activity.filter(entry=>entry.requestIds.includes(req.id))} date={historyDate}/>}
 {projectTab==='Escalations & defects'&&<section className="panel">{defectTable(defects.filter(d=>d.request===req.id))}</section>}
 {['Tasks','Files & workflows'].includes(projectTab)&&<FileWorkflows files={requestFiles} tasks={requestTasks} account={req.account}
  openTask={id=>navigate('Task',id)} locked={isRunning} addTask={file=>setDialog({kind:'newtask',request:req.id,file})}
  editFile={file=>setDialog({kind:'renamefile',file})} deleteFile={file=>setDialog({kind:'deletefile',file})}
  addSubtask={addSubtask} canAddSubtask={canAddSubtask} orders={workflowOrders} {...{moveTask,taskTypes,typeLabel,editTaskStatuses,editTaskTypes}} showError={setWorkflowError}
  {...{people,canManage,editable,changeTask,taskAction,statusBadge,statuses,date,zone,localValue,toInstant}}/>}
 {canManage&&['Tasks','Files & workflows'].includes(projectTab)&&removedFiles.length>0&&
  <details className="panel removed-files"><summary>Deleted files ({removedFiles.length})</summary>
   {removedFiles.map(file=><div key={file.id}><span>{file.name}</span><button onClick={()=>updateFile(file,'restore')}>Restore</button></div>)}
  </details>}
 <Metadata record={req} date={historyDate}/></>}
 {view==='Planning'&&canManage&&<>
 {canSeeResources&&<div className="planning-tabs">{tabs(['Dispatch','Team resources'],projectTab==='Team resources'?'Team resources':'Dispatch',setProjectTab)}</div>}
 {projectTab==='Team resources'&&canSeeResources ?
  <ResourceTimeline active={timers} {...{tasks,now,zone,date,navigate,toInstant,statuses,typeLabel}} groups={teamGroups}/> :
  <section className="panel"><div className="panel-header filters">{searchInput('Search ready work')}{selectFilter(['All','Unassigned','Assigned'])}</div>{taskTable(tasks.filter(t=>!parents.has(t.id)&&phase(t.status)==='To-do'&&!taskBlocked(t)&&search(t.file,typeLabel(t.type),t.request)&&(filter==='All'||(filter==='Assigned')===Boolean(t.person))))}</section>}
 </>}
 {view==='Planning'&&!canManage&&canSeeResources&&<ResourceTimeline active={timers} {...{tasks,now,zone,date,navigate,toInstant,statuses,typeLabel}} groups={teamGroups}/>}
 {view==='Profile'&&<>
  <section className="panel"><div className="panel-header"><h2>Timer preferences</h2></div>
   <label className="timer-preference"><input type="checkbox" checked={autoFloatTaskTimer}
    onChange={event=>changeProfilePreference({autoFloatTaskTimer:event.target.checked})}/>
    <span><strong>Automatically open the floating task timer</strong><small>Break timers always open when you start a break.</small></span>
   </label>
  </section>
  <section className="panel break-section"><TodayBreaks {...{dailyBreaks,date,clock}} expanded/></section>
  <ResourceTimeline key={profile} person={profile} active={timers} {...{tasks,now,zone,date,navigate,toInstant,statuses,typeLabel}} groups={teamGroups}/>
 </>}
 {view==='Teams'&&canManage&&<>
 {shiftEditors.length>0&&<ShiftSettings people={shiftEditors} profiles={profiles} timeOff={timeOff}
  updateTimeOff={(name,change)=>{
   if(!shiftEditors.includes(name))return;
   setState(s=>({...s,timeOff:{...s.timeOff,[name]:change(s.timeOff?.[name]??[])}}));
  }} shifts={{...shiftDefaults,...shifts}} save={(name,shift)=>{
  if(!shiftEditors.includes(name))return;
  setState(s=>({...s,shifts:{...s.shifts,[name]:shift}}));setNotice('Shift saved');
 }}/>}
 <TeamOrg groups={teamGroups} profiles={profiles} editable={role==='Manager'}
  save={change=>setState(s=>s.profiles[s.profile].role==='Manager'?{...s,teamGroups:change(s.teamGroups??defaultTeamGroups)}:s)}/></>}
 {view==='Admin'&&role==='Manager'&&<>
 <LabelCatalog items={accounts} title="Account labels" id="account-labels" itemName="account"
  save={next=>setState(s=>({...s,accounts:next}))}/>
 <TimelineAdmin access={timelineAccess} onChange={(name,enabled)=>setState(s=>({...s,timelineAccess:{...s.timelineAccess,[name]:enabled}}))}/>
 <StatusAdmin title="Request status labels" id="request-status-labels" statuses={requestStatuses} save={next=>setState(s=>({...s,requestStatuses:next}))}/>
 <StatusAdmin title="Task status labels" id="task-status-labels" statuses={statuses} save={next=>setState(s=>({...s,statuses:next}))}/>
 <TaskTypeAdmin taskTypes={taskTypes} save={next=>setState(s=>({...s,taskTypes:next}))}/>
 <TimelineAdmin title="Work time correction access" description="Choose which roles can add or correct backdated task work sessions."
  access={correctionAccess} onChange={(name,enabled)=>setState(s=>({...s,correctionAccess:{...correctionAccess,[name]:enabled}}))}/>
 <TimelineAdmin title="Activity log access" description="Choose which demo roles can review changes on requests and tasks."
  access={activityAccess} onChange={(name,enabled)=>setState(s=>({...s,activityAccess:{...s.activityAccess,[name]:enabled}}))}/>
 </>}
 {view==='My work'&&<><Breaks plans={breakPlans[profile]??[]} running={activeBreak} floatControl={activeBreak&&floating.control} dailyBreaks={dailyBreaks}
  {...{zone,toInstant,date,now,clock}} book={bookBreak} start={startBreak} end={endBreak} remove={cancelBreak}/>
 <section className="panel"><div className="panel-header filters">{tabs(['Table','Cards'],mode,setMode)}{<select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="All">All statuses</option>
 {['To-do','In progress','Complete'].map(group=><optgroup key={group} label={group}>{statuses.filter(status=>status.group===group).map(status=>
  <option key={status.id} value={status.id}>{status.label}</option>)}</optgroup>)}</select>}</div>{(()=>{const items=tasks.filter(t=>!parents.has(t.id)&&t.person===profile&&(filter==='All'||t.status===filter));return mode==='Table'?taskTable(items):<div className="task-cards">{items.map(t=><article key={t.id}><small>{typeLabel(t.type)} · {t.request}</small><button className="link record" onClick={()=>navigate('Task',t.id)}>{t.file}</button>{statusBadge(t.status)}<p>{date(t.due)}</p>{taskAction(t)}</article>)}{!items.length&&<p className="empty">No matching tasks.</p>}</div>;})()}</section></>}
 {view==='Task'&&task&&archivedFiles.has(task.fileId)&&<section className="panel"><p className="note">This task belongs to a deleted file.</p>
  <button className="link" onClick={()=>navigate('Request',task.request)}>Open related request</button></section>}
 {view==='Task'&&task&&!archivedFiles.has(task.fileId)&&<><section className="panel details"><div className="panel-header"><div>{(taskIsParent||!editable(task))&&statusBadge(task.status)} <button className="link" onClick={()=>navigate('Request',task.request)}>{task.request}</button></div>{taskAction(task)}</div>
 <div className="properties"><div><small>Account</small><strong>{accountLabel(requestOf(task.request)?.account)}</strong></div><div><small>Assignee</small>{taskIsParent?<strong>Subtasks only</strong>:canManage?<select aria-label="Task assignee" disabled={isRunning(task.id)}
 value={task.person} onChange={e=>changeTask(task.id,{person:e.target.value})}><option value="">Unassigned</option>{people.map(person=><option key={person}>{person}</option>)}</select>:<strong>{task.person||'Unassigned'}</strong>}</div><div><small>Due</small>{canManage?<InlineDue task={task} zone={zone} showError={setWorkflowError} localValue={localValue} toInstant={toInstant} save={fields=>changeTask(task.id,fields)}/>:<strong>{date(task.due)}</strong>}</div>
 {canManage&&<div><small>Task type</small>{task.parentTask?<strong>{typeLabel(task.type)}</strong>:<TaskTypePicker value={task.type} taskTypes={taskTypes} onEdit={editTaskTypes} disabled={isRunning(task.id)} onChange={type=>changeTask(task.id,{type})}/>}</div>}
 {!taskIsParent&&editable(task)&&<div><small>Status</small><TaskStatus task={task} statuses={statuses} locked={isRunning(task.id)} blocked={taskBlocked(task)} onEdit={editTaskStatuses} save={fields=>changeTask(task.id,fields)}/></div>}
 {taskIsParent&&<div><small>Progress</small><strong>{tasks.filter(t=>t.parentTask===task.id&&phase(t.status)==='Complete').length} of {tasks.filter(t=>t.parentTask===task.id).length} subtasks complete</strong></div>}<div><small>Recorded effort</small><strong>{clock((task.spent??0)+(isRunning(task.id)?Math.max(0,Math.floor((now-timers.find(timer=>timer.id===task.id).started)/1000)):0))}</strong></div></div>
 <TaskFields key={task.id+':'+task.pages} task={task} account={requestOf(task.request)?.account} editable={editable(task)} save={pages=>{changeTask(task.id,{pages});setNotice('Page count saved');}}/>
 {canManage&&<ScheduleFields key={task.id} task={task} zone={zone} save={fields=>{
  changeTask(task.id,fields);setNotice('Schedule saved');
 }}/>}
 {task.parentTask&&<div className="note">Parent task <button className="link" onClick={()=>navigate('Task',task.parentTask)}>{task.parentTask}</button></div>}
 {task.dependsOn&&<div className="note">Depends on <button className="link" onClick={()=>navigate('Task',task.dependsOn)}>{task.dependsOn}</button></div>}</section>
 {canManage&&<TaskRelationships key={[task.id,task.fileId,task.parentTask,task.dependsOn,...tasks.filter(item=>item.parentTask===task.id).map(item=>item.id)].join(':')} task={task} typeLabel={typeLabel} tasks={tasks.filter(item=>item.request===task.request)}
  files={workflowFiles.filter(file=>file.request===task.request&&!file.archivedAt)} save={saveRelationships}/>}
 <Metadata record={task} date={historyDate}/>
 {canSeeActivity&&<details className="task-activity"><summary>Activity log</summary>
  <ActivityLog key={task.id} entries={activity.filter(entry=>entry.taskIds.includes(task.id))} date={historyDate}/>
 </details>}
 <SessionList task={task} active={timers} date={historyDate} clock={clock} now={now}>
  {correctionAccess[role]&&!taskIsParent&&<CorrectTime key={task.id} {...{task,people,zone,toInstant,localValue}}
   running={timers.find(timer=>timer.id===task.id)} date={historyDate} save={saveCorrection}/>}
 </SessionList>
 {(canManage||taskIsParent)&&<section className="panel"><div className="panel-header"><h2>Subtasks</h2>{canManage&&<button disabled={!canAddSubtask(task)} onClick={()=>addSubtask(workflowFiles.find(file=>file.id===task.fileId),task)}>Add subtask</button>}</div>{taskTable(tasks.filter(t=>t.parentTask===task.id))}</section>}
 <section className="panel"><div className="panel-header"><h2>Related defects</h2><button onClick={()=>setDialog({kind:'defect',request:task.request,task:task.id})}>New report</button></div>{defectTable(defects.filter(d=>d.task===task.id||d.relatedTasks?.includes(task.id)))}</section></>}
 {view==='Defects'&&<section className="panel"><div className="panel-header filters">{searchInput('Search defect reports')}{selectFilter(['All','Open','Under review','Closed'])}</div>{defectTable(defects.filter(d=>search(d.id,d.title,d.request)&&(filter==='All'||d.status===filter)))}</section>}
 {view==='Defect'&&defect&&<>
  <section className="panel rca-record">
   <div className="panel-header"><div>{badge(defect.severity)} {defectLocked&&<span className="badge gray">Locked</span>}</div>
    {defectLocked?role==='Manager'&&<button onClick={()=>updateDefect(defect.id,{},'reopen','Reopened defect report')}>Reopen report</button>:
     canEditDefect(defect,profile,role)&&<button onClick={()=>setDialog({kind:'defect',existing:defect})}>Edit report</button>}</div>
   <div className="properties">
    <div><small>Assigned to</small><ReviewSelect label="Assigned to" values={[...new Set([...reviewers,defect.assignedTo].filter(Boolean))]}
     value={defect.assignedTo} placeholder="Unassigned" disabled={defectLocked||!canReview}
     onChange={assignedTo=>updateDefect(defect.id,{assignedTo},'edit','Changed RCA assignee')}/></div>
    <div><small>Reviewed by</small><ReviewSelect label="Reviewed by" values={[...new Set([...reviewers,defect.reviewedBy].filter(Boolean))]}
     value={defect.reviewedBy} placeholder="Not reviewed" disabled={defectLocked||!canReview}
     onChange={reviewedBy=>updateDefect(defect.id,{reviewedBy},'edit','Changed RCA reviewer')}/></div>
    <div><small>Status</small><ReviewSelect label="RCA status" className={'status-picker '+palette[defect.status]} optionColors={palette} values={defectStatuses} value={defect.status} disabled={defectLocked||!canReview}
     onChange={status=>updateDefect(defect.id,{status},'edit',status==='Closed'?'Closed defect report':'Changed RCA status')}/></div>
    <div><small>Severity</small><ReviewSelect label="RCA severity" values={defectSeverities} value={defect.severity} disabled={defectLocked||!canReview}
     onChange={severity=>updateDefect(defect.id,{severity},'edit','Changed RCA severity')}/></div>
   </div>
   <div className="properties rca-related">
    <div><small>Related request</small><button className="link" onClick={()=>navigate('Request',defect.request)}>{requestOf(defect.request)?.title||defect.request}</button></div>
    <div><small>Related tasks</small>{defect.task?<button className="link" onClick={()=>navigate('Task',defect.task)}>
     {taskOf(defect.task)?.file||defect.task} · Primary</button>:<strong>—</strong>}
     {defect.relatedTasks.map(id=><button className="link" key={id} onClick={()=>navigate('Task',id)}>
      {taskOf(id)?.file||id} · {typeLabel(taskOf(id)?.type)||id}</button>)}</div>
    <div><small>Linked operator</small><strong>{defect.operator||'—'}</strong></div>
    <div><small>Team</small><strong>{defect.team||'—'}</strong></div>
    <div><small>Account</small><strong>{accountLabel(defect.account)||'—'}</strong></div>
   </div>
  </section>
  <div className="rca-layout">
   <div>
    <section className="panel"><RcaBody record={defect}/></section>
    <Acknowledgment key={defect.id+':'+defect.revision+':'+profile} record={defect} profile={profile} date={historyDate}
     sign={signature=>updateDefect(defect.id,{signature},'sign','Operator signed acknowledgment')}/>
    <Metadata record={{...defect,modifiedBy:defect.modifiedBy??defectEntries[0]?.actor}} date={historyDate}/>
    {canSeeActivity&&<ActivityLog key={defect.id} entries={defectEntries} date={historyDate}/>}
   </div>
   <RcaTimeline record={defect} entries={defectEntries} date={historyDate}/>
  </div>
 </>}
 </>}</main><footer>Production Workspace <span>Prototype · Changes stay in this browser</span></footer>
 </div>
 {notice&&<div className="toast" role="status">{notice}</div>}
 {dialog&&dialog.kind!=='defect'&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null);}}><div className={'modal '+(dialog.kind==='rank'?'wide':'')} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
 <div className="dialog-head"><h2 id="dialog-title">{{request:'New request',rank:'Ranked operator suggestions',timer:'Another timer is running',newfile:'Add file',renamefile:'Rename file',deletefile:'Delete file',newtask:dialog.parent?'Add subtask':'Add file task'}[dialog.kind]}</h2><button aria-label="Close dialog" onClick={()=>setDialog(null)}>×</button></div>
 {dialog.kind==='request'&&<RequestForm zone={zone} {...{taskTypes,accounts,editAccounts}} save={values=>{
  const id='RQ-'+(Math.max(1045,...requests.map(r=>Number(r.id.split('-')[1])))+1);
  commit('Created request',(s,timestamp)=>({...s,requests:[{...values,id,status:'Ready',risk:'Unscheduled',
   forecast:null,owner:profile,...audit(timestamp,profile,true)},...s.requests]}));
  setDialog(null);navigate('Request',id);setNotice('Request created');
 }}/>}
 {dialog.kind==='newfile'&&<form onSubmit={e=>{
  e.preventDefault();
  const input=e.currentTarget.elements.file;
  const name=input.value.trim();
  if(!name){input.setCustomValidity('Enter a file name.');input.reportValidity();return;}
  if(workflowFiles.some(file=>file.request===dialog.request&&!file.archivedAt&&file.name.toLowerCase()===name.toLowerCase())){
   input.setCustomValidity('This file is already on the request.');input.reportValidity();return;
  }
  const id='file-'+crypto.randomUUID();
  commit('Added file',(s,timestamp)=>({...s,workflowFiles:[...s.workflowFiles,
   {id,request:dialog.request,name,...audit(timestamp,profile)}]}));
  setDialog(null);setNotice('File added');
 }}><label>File name<input name="file" required maxLength="180" onInput={e=>e.currentTarget.setCustomValidity('')}/></label>
 <div className="actions"><button className="primary" type="submit">Add file</button></div></form>}
 {dialog.kind==='renamefile'&&<form onSubmit={event=>{
  event.preventDefault();updateFile(dialog.file,'rename',event.currentTarget.elements.file.value);
 }}><label>File name<input name="file" defaultValue={dialog.file.name} required maxLength="180"/></label>
  <div className="actions"><button type="button" onClick={()=>setDialog(null)}>Cancel</button><button className="primary">Save file name</button></div>
 </form>}
 {dialog.kind==='deletefile'&&<>
  <p>Delete <strong>{dialog.file.name}</strong> and its workflow from this request? You can restore it from Deleted files.</p>
  <div className="actions"><button onClick={()=>setDialog(null)}>Cancel</button>
   <button className="file-danger" onClick={()=>updateFile(dialog.file,'delete')}>Delete file</button></div>
 </>}
 {dialog.kind==='newtask'&&<form onSubmit={e=>{
  e.preventDefault();
  const d=new FormData(e.currentTarget);
  const id='FT-'+(Math.max(1056,...allTasks.map(t=>Number(t.id.split('-')[1])))+1);
  const {parent,file}=dialog;
  if(!canManage||file.archivedAt||parent&&!canAddSubtask(parent))return;
  const dependsOn=d.get('dependsOn')||null;
  const pages=d.get('pages')===''?null:Number(d.get('pages'));
  commit(parent?'Added subtask':'Added task',(s,timestamp)=>{
   const entry={
   id,request:dialog.request,file:file.name,fileId:file.id,type:parent?.type??d.get('type'),
   parentTask:parent?.id,dependsOn,pages,
   due:requestOf(dialog.request)?.due,status:dependsOn&&phase(taskOf(dependsOn)?.status)!=='Complete'?'Waiting':'Ready',
   person:d.get('person'),spent:0,sessions:[],...audit(timestamp,profile,Boolean(d.get('person'))),
   };
   const existingFirst=workflowOrder(s.tasks.filter(item=>item.fileId===file.id),s.workflowOrders?.[file.id])[0];
   if(entry.pages==null&&existingFirst?.pages!=null)entry.pages=existingFirst.pages;
   const next=[...s.tasks,entry];
   return {...s,tasks:copyFirstPageCount(next,file.id,id,s.workflowOrders?.[file.id],timestamp)};
  });
  setDialog(null);setNotice(parent?'Subtask added':'Task added');
 }}><label>File<input value={dialog.file.name} readOnly/></label>
 {dialog.parent?<label>Task type<input value={typeLabel(dialog.parent.type)} readOnly/><small>Inherited from the parent task</small></label>:
  <label>Task type<select name="type">{taskTypes.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
 <label>Start after <select name="dependsOn"><option value="">No dependency</option>
 {predecessorChoices(dialog.file,dialog.parent).map(t=><option key={t.id} value={t.id}>{typeLabel(t.type)} · {t.id}</option>)}</select></label>
 <label>Assignee <select name="person"><option value="">Unassigned</option>{people.map(person=><option key={person}>{person}</option>)}</select></label>
 <label>Page count<input name="pages" type="number" min="1" max="100000" placeholder="Optional"/></label>
 <div className="actions"><button type="submit" className="primary">{dialog.parent?'Add subtask':'Add task'}</button></div></form>}
 {dialog.kind==='timer'&&<><p>Pause or complete <strong>{activeTask?.file}</strong> before starting {dialog.target.file}.</p><div className="actions"><button onClick={()=>setDialog(null)}>Cancel</button><button className="primary" onClick={()=>stop()}>Pause current timer</button></div></>}
 {dialog.kind==='rank'&&(()=>{const t=dialog.task,account=requestOf(t.request)?.account,e=estimate(account,t.type,t.pages);return <><p>{t.file} · {accountLabel(account)} · {formatMinutes(e.minutes)} · Due {date(t.due)}</p><div className="table-wrap"><table><thead><tr><th>Operator</th><th>Account training</th><th>Free before due</th><th>Earliest start</th><th>Due fit</th><th></th></tr></thead><tbody>{operatorRanking(account,t.due,e.minutes).map(p=><tr key={p.name}><td>{p.name}</td><td>{badge(p.trained?'Trained':'Untrained')}</td><td>{formatMinutes(p.free)}</td><td>{p.free>0?short(p.start):'—'}</td><td>{badge(p.fits==null?'Unknown':p.fits?'Fits':'Does not fit')}</td><td><button onClick={()=>{changeTask(t.id,{person:p.name});setDialog(null);setNotice('Assigned to '+p.name);}}>Assign</button></td></tr>)}</tbody></table></div><p className="note">Sample calendars rank by account training, then free time before due, then earliest start.</p></>;})()}

 </div></div>}
 </div>;
}

function ScheduleFields({task, zone, save}){
 const [error,setError]=useState('');
 return <form className="task-fields" key={zone} onSubmit={e=>{
  e.preventDefault();
  const form=new FormData(e.currentTarget);
  const start=form.get('start'),end=form.get('end');
  const scheduledStart=start?Date.parse(toInstant(start,zone)):null;
  const scheduledEnd=end?Date.parse(toInstant(end,zone)):null;
  if ((start||end)&&(!Number.isFinite(scheduledStart)||!Number.isFinite(scheduledEnd)||scheduledEnd<=scheduledStart)){
   setError('Enter a valid start and an end after it, or clear both fields.');return;
  }
  setError('');save({scheduledStart,scheduledEnd});
 }}>
  <label>Scheduled start<ZonedInput name="start" zone={zone} toInstant={toInstant} initial={localValue(task.scheduledStart,zone)}/></label>
  <label>Scheduled end<ZonedInput name="end" zone={zone} toInstant={toInstant} initial={localValue(task.scheduledEnd,zone)}/></label>
  <button type="submit">Save schedule</button>
  {error&&<p className="error" role="alert">{error}</p>}
 </form>;
}

function TaskFields({task,account,editable,save}){
 const [pages,setPages]=useState(task.pages??'');
 const e=estimate(account,task.type,pages===''?null:Number(pages));
 return <form className="task-fields" onSubmit={ev=>{ev.preventDefault();if(editable)save(pages===''?null:Number(pages));}}>
 <label>Page count<input type="number" min="1" step="1" placeholder="Not set" value={pages} onChange={ev=>setPages(ev.target.value)} readOnly={!editable}/><small>{editable?'Optional. Leave blank to use matching history.':'Read only for this demo role.'}</small></label>
 <div className="estimate"><small>Estimated effort</small><strong>{formatMinutes(e.minutes)}</strong>{badge(e.source)}{e.samples&&<small>{e.samples} matching files · 180 days {e.samples<5?'· Low sample':''}</small>}</div>
 {editable&&<button className="primary" type="submit">Save details</button>}
 </form>;
}
function copyFirstPageCount(tasks,fileId,sourceId,order,timestamp){
 const [first,...downstream]=workflowOrder(tasks.filter(task=>task.fileId===fileId),order);
 if(!first||first.id!==sourceId||first.pages==null)return tasks;
 const blanks=new Set(downstream.filter(task=>task.pages==null&&!task.pagesManual).map(task=>task.id));
 return tasks.map(task=>blanks.has(task.id)?patchRecord(task,{pages:first.pages},timestamp):task);
}
function taskBranch(id,tasks){
 const result=new Set([id]);
 for(let pass=0;pass<tasks.length;pass++){
  const size=result.size;
  for(const task of tasks)if(result.has(task.parentTask))result.add(task.id);
  if(result.size===size)break;
 }
 return tasks.filter(task=>result.has(task.id));
}
function localValue(timestamp,zone){
 if(timestamp==null)return '';
 const fmt=new Intl.DateTimeFormat('sv-SE',{timeZone:zones[zone],year:'numeric',
  month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 return fmt.format(new Date(timestamp)).replace(' ','T');
}
function toInstant(value,zone){
 const target=Date.parse(value+'Z');
 if(!Number.isFinite(target))return null;
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zones[zone],year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const asUTC=n=>{const a=Object.fromEntries(fmt.formatToParts(new Date(n)).map(p=>[p.type,p.value]));return Date.UTC(a.year,a.month-1,a.day,a.hour,a.minute);};
 let result=target;
 for(let i=0;i<4;i++){const offset=target-asUTC(result);if(!offset)break;result+=offset;}
 if(asUTC(result)!==target)return null;
 return new Date(result).toISOString();
}
function AccountPicker({value,accounts,onChange,onEdit}){
 return <StatusPicker {...{value,onChange,onEdit}} label="Account" editLabel="Edit account labels" groupOrder={['Accounts']}
  statuses={accounts.map(account=>({...account,group:'Accounts'}))}/>;
}
function RequestForm({save,taskTypes,accounts,editAccounts,zone='Pacific'}){
 const [account,setAccount]=useState(accounts[0]?.id??''),[files,setFiles]=useState(12),[counts,setCounts]=useState({Formatting:null,QC:null}),[error,setError]=useState('');
 const selected=Object.keys(counts);
 const rows=selected.map(t=>{const qty=counts[t]??files,e=estimate(account,t,null);return {type:t,qty,...e};});
 const partial=rows.some(r=>r.qty>0&&r.minutes===null);
 const sum=rows.reduce((total,r)=>total+(r.minutes??0)*r.qty,0);
 return <form onSubmit={e=>{e.preventDefault();if(!selected.length)return setError('Select at least one task type.');const d=new FormData(e.currentTarget);const due=toInstant(d.get('due'),zone);if(!due)return setError('Choose a valid local date and time.');save({title:d.get('title').trim(),account,files,types:selected,due,initialMinutes:partial?null:sum});}}>
 <label>Request title<input name="title" placeholder="e.g. Member handbook refresh" required maxLength="80"/></label>
 <div className="form-grid"><div><small>Account</small><AccountPicker value={account} accounts={accounts} onEdit={editAccounts} onChange={setAccount}/></div>
 <label>Planned files<input type="number" min="1" max="10000" required value={files} onChange={e=>{const qty=Number(e.target.value);setFiles(qty);setCounts(c=>Object.fromEntries(Object.entries(c).map(([t,n])=>[t,n===null?null:Math.min(n,qty)])));}}/></label></div>
 <label>Target due<ZonedInput zone={zone} toInstant={toInstant} name="due" initial="2026-11-27T17:00" required/></label>
 <fieldset><legend>Task types</legend><div className="check-row">{taskTypes.map(({id:t,label})=><label key={t}><input type="checkbox" checked={t in counts} onChange={()=>setCounts(c=>{const next={...c};if(t in next)delete next[t];else next[t]=null;return next;})}/>{label}</label>)}</div></fieldset>
 <div className="table-wrap preview-table"><table><thead><tr><th>Task type</th><th>Files</th><th>Average / file</th><th>Effort</th></tr></thead><tbody>{rows.map(r=><tr key={r.type}><td>{taskTypes.find(type=>type.id===r.type)?.label??r.type}</td><td><input aria-label={r.type+' applicable files'} type="number" min="1" max={files} required value={r.qty} onChange={e=>setCounts(c=>({...c,[r.type]:Number(e.target.value)}))}/></td><td>{formatMinutes(r.minutes)}{r.samples&&<small>{r.samples} historical files</small>}</td><td>{formatMinutes(r.minutes===null?null:r.qty*r.minutes)}</td></tr>)}</tbody></table></div>
 <div className="note"><strong>{partial?'Known subtotal':'Estimated active effort'}: {formatMinutes(sum)}</strong><br/>{partial?'Some task types have no matching history.':'Forecast finish depends on calendars and dependencies.'}</div>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="actions"><button type="submit" className="primary">Create request</button></div>
 </form>;
}
createRoot(document.querySelector('#root')).render(<App/>);
