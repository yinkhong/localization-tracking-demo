import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {demoRequests,demoTasks,demoDefects,estimate,formatMinutes,operatorRanking,types,zones} from './data';
import {audit, bootstrapTimeline, groups, Metadata, patchRecord, ResourceTimeline, SessionList, TimelineAdmin, timelineRoles} from './timeline';
import {ActivityLog, bootstrapWorkflow, demoProfiles, FileWorkflows, InlineDue, TaskSelect, TaskStatus, withActivity} from './workflow';
import {blockedTask, bootstrapStatuses, dependencyIds, parentTaskIds, resolveTasks, StatusAdmin, StatusPicker, statusGroup} from './status';
import {DefectForm, RcaBody} from './rca';
import './style.css';

const sections=[['Overview','◫'],['Requests','▤'],['Planning','▦'],['My work','✓'],['Defects','◇']];
const palette={'In progress':'blue','Under review':'blue','Ready':'green','On track':'green','Complete':'green','Trained':'green','Fits':'green','At risk':'red','Major':'red','Waiting':'amber','Paused':'amber','Does not fit':'amber','Open':'amber','Unscheduled':'gray','Historical':'blue','Page-based':'green'};
const badge = name => <span className={'badge '+(palette[name]||'gray')}><i/>{name}</span>;
const clock = n => [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');
const dataKey='localization-workspace-v1';
function load(){
 try{
  const value=JSON.parse(localStorage.getItem(dataKey));
  if(value?.requests&&value?.tasks&&value?.defects)return bootstrapStatuses(bootstrapWorkflow(bootstrapTimeline(value,false)));
 }catch{}
 return bootstrapStatuses(bootstrapWorkflow(bootstrapTimeline({requests:demoRequests,tasks:demoTasks,defects:demoDefects,zone:'Pacific',active:null},true)));
}
function App(){
 const [state,setState]=useState(load),[view,setView]=useState(()=>state.profiles[state.profile].role==='Operator'?'My work':'Overview'),[record,setRecord]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[dialog,setDialog]=useState(null),[notice,setNotice]=useState(''),[now,setNow]=useState(Date.now()),[mode,setMode]=useState('Table'),[projectTab,setProjectTab]=useState('Tasks');
 const {requests,tasks,defects,timelineAccess,activityAccess,activeTimers,profile,profiles,workflowFiles,activity,statuses}=state;
 const {role,zone}=profiles[profile];
 const active=activeTimers[profile];
 const timers=Object.values(activeTimers);
 const isRunning=id=>timers.some(timer=>timer.id===id);
 const parents=parentTaskIds(tasks);
 const statusName=id=>statuses.find(status=>status.id===id)?.label??id;
 const phase=id=>statusGroup(statuses,id);
 const statusBadge=id=><span className={'badge '+({'To-do':'amber','In progress':'blue','Complete':'green'}[phase(id)]??'gray')} title={phase(id)}><i/>{statusName(id)}</span>;
 const canSeeActivity=Boolean(activityAccess[role]);
 const canManage = role !== 'Operator';
 const canSeeResources = Boolean(timelineAccess[role]);
 const people = [...new Set(groups.flatMap(g=>g.members))];
 useEffect(()=>{try{localStorage.setItem(dataKey,JSON.stringify(state));}catch{setNotice('Browser storage is full. These changes are available for this session.');}},[state]);
 useEffect(()=>{if(!Object.keys(activeTimers).length)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[activeTimers]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{const close=e=>{if(e.key==='Escape')setDialog(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 const historyDate = value => value == null ? '—' : new Intl.DateTimeFormat('en-US',{
  timeZone:zones[zone],year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'
 }).format(new Date(value));
 const date=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:zones[zone]||zones.Pacific,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(v)):'—';
 const short=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:zones[zone]||zones.Pacific,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(v)):'—';
 const navigate=(next,id='')=>{setDialog(null);setView(next);setRecord(id);setFilter('All');setQuery('');setProjectTab('Tasks');window.scrollTo(0,0);};
 const requestOf=id=>requests.find(r=>r.id===id);
 const taskOf=id=>tasks.find(t=>t.id===id);
 const req=requestOf(record), task=taskOf(record), defect=defects.find(d=>d.id===record);
 const requestTasks=req?tasks.filter(t=>t.request===req.id):[];
 const requestFiles=req?workflowFiles.filter(f=>f.request===req.id):[];
 const activeTask=active&&taskOf(active.id);
 const elapsed=activeTask?(activeTask.spent??0)+Math.max(0,Math.floor((now-active.started)/1000)):0;
 const taskBlocked=(task,all=tasks)=>blockedTask(task,all,statuses);
 const stats=[['Open requests',requests.filter(r=>phase(r.status)!=='Complete').length,'Across all sample accounts','▤'],['At risk',requests.filter(r=>r.risk==='At risk').length,'Needs PM attention','!'],['Ready to assign',tasks.filter(t=>!parents.has(t.id)&&phase(t.status)==='To-do'&&!taskBlocked(t)&&!t.person).length,'Unassigned operations','＋'],['Defects in review',defects.filter(d=>d.status!=='Closed').length,'Awaiting a decision','◇']];
 const editable=t=>canManage||t?.person===profile;
 const taskIsParent=task&&parents.has(task.id);
 const canAddSubtask=task=>!isRunning(task.id)&&!(phase(task.status)==='Complete'&&tasks.some(
  item=>phase(item.status)!=='To-do'&&dependencyIds(item,tasks).includes(task.id)));
 function addSubtask(file,parent){
  if(!canAddSubtask(parent)){setNotice('Finish the active timer or downstream work before changing this workflow.');return;}
  setDialog({kind:'newtask',request:parent.request,file,parent});
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
   const next=updated.tasks===s.tasks?updated:{...updated,tasks:resolveTasks(updated.tasks,updated.statuses,timestamp)};
   return withActivity(s,next,profile,timestamp,action);
  });
 }
 function saveDefect(values){
  const existing=dialog.existing;
  const id=existing?.id||'DF-'+String(Math.max(87,...defects.map(d=>Number(d.id.split('-')[1])))+1).padStart(4,'0');
  commit(existing?'Updated defect report':'Created defect report',(s,timestamp)=>({...s,
   defects:existing?s.defects.map(d=>d.id===id?patchRecord(d,values,timestamp):d):[{...values,id,...audit(timestamp,profile)},...s.defects],
  }));
  setDialog(null);navigate('Defect',id);setNotice('RCA report saved');
 }
 function changeProfilePreference(update){
  setState(s=>({...s,profiles:{...s.profiles,[profile]:{...s.profiles[profile],...update}}}));
 }
 function changeTask(id,fields){
  const action=Object.hasOwn(fields,'person')?'Changed assignee':Object.hasOwn(fields,'status')?'Changed status':'Updated task';
  commit(action,(s,timestamp)=>{
   const task=s.tasks.find(item=>item.id===id);
   if(!task||!editable(task))return s;
   if(!canManage&&Object.keys(fields).some(key=>!['pages','status'].includes(key)))return s;
   if(Object.values(s.activeTimers).some(timer=>timer.id===id)&&
      ['person','type','status'].some(key=>Object.hasOwn(fields,key)))return s;
   if(parentTaskIds(s.tasks).has(id)&&['person','status','pages','scheduledStart','scheduledEnd'].some(key=>Object.hasOwn(fields,key)))return s;
   if(fields.status&&(!phase(fields.status)||(taskBlocked(task,s.tasks)&&phase(fields.status)!=='To-do')||
      (phase(task.status)==='Complete'&&phase(fields.status)!=='Complete')))return s;
   if(Object.entries(fields).every(([key,value])=>(task[key]??null)===(value??null)))return s;
   const updated=s.tasks.map(item=>item.id===id?patchRecord(item,fields,timestamp,'person'):item);
   return {...s,tasks:updated};
  });
 }
 function start(task){
  if(task.person!==profile||parents.has(task.id)||phase(task.status)==='Complete'||taskBlocked(task))return;
  if(active){if(active.id!==task.id)setDialog({kind:'timer',target:task});return;}
  const timestamp=Date.now();
  const openedWith=task.status==='Paused'?'Resumed':'Started';
  setNow(timestamp);
  commit(openedWith==='Resumed'?'Resumed timer':'Started timer',(s,started)=>{
   const current=s.tasks.find(item=>item.id===task.id);
   if(current?.person!==profile||s.activeTimers[profile]||
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
 const search=(...vals)=>vals.join(' ').toLowerCase().includes(query.toLowerCase());
 const riskSummary = requests.filter(r=>r.risk==='At risk');
 const selectFilter = options => <select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select>;
 const searchInput = placeholder => <input className="search" aria-label={placeholder} placeholder={placeholder} value={query} onChange={e=>setQuery(e.target.value)}/>;
 const tabs = (values,selected,onSelect) => <div className="segments">{values.map(v=><button key={v} aria-pressed={selected===v} className={selected===v?'selected':''} onClick={()=>onSelect(v)}>{v}</button>)}</div>;
 function taskAction(t){
  if(active?.id===t.id)return <button onClick={()=>stop()}>Pause</button>;
  if(parents.has(t.id)||phase(t.status)==='Complete'||taskBlocked(t)||!editable(t))return <button onClick={()=>navigate('Task',t.id)}>View</button>;
  if(t.person&&t.person!==profile)return <button onClick={()=>navigate('Task',t.id)}>View</button>;
  if(!t.person)return <button onClick={()=>setDialog({kind:'rank',task:t})}>Suggest operator</button>;
  return <button onClick={()=>start(t)}>{t.status==='Paused'?'Resume':'Start timer'}</button>;
 }
 function requestTable(items){
  return <div className="table-wrap"><table><thead><tr><th>Request</th><th>Account</th><th>Due</th><th>Forecast</th><th>Status</th><th>Delivery risk</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td><button className="link record" onClick={()=>navigate('Request',r.id)}>{r.title}</button><small>{r.id} · {r.files} files</small></td><td>{r.account}</td><td>{date(r.due)}</td><td>{date(r.forecast)}</td><td>{statusBadge(r.status)}</td><td>{badge(r.risk)}</td></tr>)}</tbody></table>{!items.length&&<div className="empty">No matching requests.</div>}</div>;
 }
 function taskTable(items){
  return <div className="table-wrap"><table><thead><tr><th>File / operation</th><th>Assignee</th><th>Due</th><th>Effort</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map(t=>{const e=estimate(requestOf(t.request)?.account,t.type,t.pages);return <tr key={t.id}><td><button className="link record" onClick={()=>navigate('Task',t.id)}>{t.file}</button><small>{t.parentTask?'Subtask · ':''}{t.type} · {t.id}</small></td><td>{parents.has(t.id)?'Subtasks only':t.person||'Unassigned'}</td><td>{date(t.due)}</td><td>{parents.has(t.id)?'—':formatMinutes(e.minutes)}{!parents.has(t.id)&&e.source==='Historical'&&<small>Historical</small>}</td><td>{statusBadge(t.status)}</td><td>{taskAction(t)}</td></tr>;})}</tbody></table>{!items.length&&<div className="empty">No matching tasks.</div>}</div>;
 }
 function defectTable(items){
 return <div className="table-wrap"><table><thead><tr><th>Finding</th><th>Related request</th><th>Severity</th><th>Status</th></tr></thead><tbody>{items.map(d=><tr key={d.id}><td><button className="link record" onClick={()=>navigate('Defect',d.id)}>{d.title}</button><small>{d.id}</small></td><td><button className="link" onClick={()=>navigate('Request',d.request)}>{d.request}</button></td><td>{badge(d.severity)}</td><td>{badge(d.status)}</td></tr>)}</tbody></table>{!items.length&&<div className="empty">No findings to show.</div>}</div>;
 }
 const primaryNav=sections.filter(([name])=>canManage||['Requests','My work','Defects'].includes(name)||canSeeResources&&name==='Planning');
 const heading={Profile:[profile+'’s profile','Review recorded work sessions in your selected time zone.'],Admin:['Admin console','Manage demo role permissions.'],Overview:['Delivery overview','Monitor commitments, available work, and quality in one place.'],Requests:['Requests','Manage project intake, effort estimates, and delivery commitments.'],Planning:['Team dispatch','Review ready work and choose an available operator.'],'My work':['My work','Review your assignments and record active work.'],Defects:['Escalations & defects','Review findings and trace them to the affected work.'],Request:[req?.title,req?.id+' · '+req?.account],Task:[task?.file,task?.id+' · '+task?.type],Defect:[defect?.title,defect?.id+' · Defect report']}[view];
 return <div className="app">
 <aside className="sidebar"><div className="brand"><span className="logo">L</span><span>Production<br/><small>Localization workspace</small></span></div>
 <nav aria-label="Main navigation">{primaryNav.map(([name,icon])=><button key={name} className={(view===name||view==='Request'&&name==='Requests'||view==='Profile'&&name==='My work'||view==='Task'&&name===(role==='Operator'?'My work':'Requests')||view==='Defect'&&name==='Defects')?'current':''} onClick={()=>navigate(name)}><span>{icon}</span>{name}</button>)}</nav>
 <div className="sidebar-bottom">{role==='Manager'&&<button className="sidebar-link" onClick={()=>navigate('Admin')}>Admin console</button>}
 <button className="account" onClick={()=>navigate('Profile')} aria-label={'Open '+profile+'’s profile'}><span className="avatar">{profile[0]}</span><span><strong>{profile}</strong><small>{role} · Demo</small></span></button></div>
 </aside>
 <div className="body">
 <header className="top"><div className="crumb">Workspace <span>/</span> {view}</div><div className="controls"><span className="demo-tag">Sample data</span><label>Profile <select value={profile} onChange={e=>{
 const name=e.target.value;setDialog(null);setState(s=>({...s,profile:name}));
 navigate(profiles[name].role==='Operator'?'My work':'Overview');
 }}>{Object.keys(demoProfiles).map(name=><option key={name}>{name}</option>)}</select></label>
 <label>Role <select value={role} onChange={e=>{const r=e.target.value;setDialog(null);changeProfilePreference({role:r});navigate(r==='Operator'?'My work':'Overview');}}>{timelineRoles.map(x=><option key={x}>{x}</option>)}</select></label><label>Time zone <select value={zone} onChange={e=>changeProfilePreference({zone:e.target.value})}>{Object.keys(zones).map(z=><option key={z}>{z}</option>)}</select></label></div></header>
 <main>
 {dialog?.kind==='defect'?<>
  <div className="heading"><div><h1>{dialog.existing?'Edit RCA report':'New RCA report'}</h1></div></div>
  <DefectForm key={dialog.existing?.id||'new'} requests={requests} tasks={tasks} config={dialog}
   save={saveDefect} cancel={()=>setDialog(null)}/>
 </>:<>
 {['Request','Task','Defect'].includes(view)&&<button className="link back" onClick={()=>navigate(view==='Request'?'Requests':view==='Task'?(task?.parentTask?'Task':role==='Operator'?'My work':'Request'):'Defects',task?.parentTask||task?.request)}>‹ Back</button>}
 <div className="heading"><div><h1>{heading?.[0]}</h1><p>{heading?.[1]}</p></div>{(['Overview','Requests'].includes(view)&&role!=='Operator')&&<button className="primary" onClick={()=>setDialog({kind:'request'})}>＋ New request</button>}{view==='Defects'&&<button className="primary" onClick={()=>setDialog({kind:'defect'})}>＋ New report</button>}</div>
 {activeTask&&<div className="timer"><div>{badge('In progress')} <button className="link" onClick={()=>navigate('Task',activeTask.id)}>{activeTask.file} · {activeTask.type}</button></div><div><strong>{clock(elapsed)}</strong><button onClick={()=>stop()}>Pause</button><button className="primary" onClick={()=>stop(true)}>Complete</button></div></div>}
 {view==='Overview'&&<>
 <div className="metrics">{stats.map(([label,value,detail,icon])=><div className="metric" key={label}><div className="metric-top"><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{detail}</small></div>)}</div>
 <div className="overview-grid"><section className="panel chart"><div className="panel-header"><div><h2>Quality trend</h2><p>Confirmed defects per 100 inspected pages</p></div><span className="subtle">Last 4 weeks</span></div><div className="bars" aria-label="Example quality trend: 1.2, 0.9, 0.7, 0.6"><div className="chart-grid"/>{[1.2,.9,.7,.6].map((v,i)=><div className="bar-column" key={i}><div style={{height:(v/1.2)*86+'%'}} className="chart-bar"><span>{v.toFixed(1)}</span></div><small>Week {i+1}</small></div>)}</div></section>
 <section className="panel attention"><div className="panel-header"><div><h2>Needs attention</h2><p>Delivery risks and next actions</p></div></div>{riskSummary.map(r=><div className="attention-item" key={r.id}><div><button className="link record" onClick={()=>navigate('Request',r.id)}>{r.title}</button><small>{r.id} · Due {date(r.due)}</small></div>{badge('At risk')}</div>)}<div className="attention-item"><div><button className="link record" onClick={()=>navigate('Planning')}>Unassigned work</button><small>Review available operators</small></div>{badge('Ready')}</div><div className="attention-item"><div><button className="link record" onClick={()=>navigate('Defects')}>Defect review queue</button><small>Open related evidence and tasks</small></div>{badge('Under review')}</div></section></div>
 <section className="panel"><div className="panel-header"><h2>Recent requests</h2><button onClick={()=>navigate('Requests')}>View all requests</button></div>{requestTable(requests.slice(0,4))}</section></>}
 {view==='Requests'&&<section className="panel"><div className="panel-header filters">{searchInput('Search requests')}{selectFilter(['All','At risk','On track','Unscheduled'])}</div>{requestTable(requests.filter(r=>search(r.title,r.id,r.account)&&(filter==='All'||r.risk===filter)))}</section>}
 {view==='Request'&&req&&<><section className="panel summary"><div>{statusBadge(req.status)} {badge(req.risk)}{canManage&&<StatusPicker label="Request status" statuses={statuses} value={req.status}
  onChange={status=>commit('Changed request status',(s,timestamp)=>({...s,requests:s.requests.map(r=>r.id===req.id?patchRecord(r,{status},timestamp):r)}))}/>}</div><div><small>Project owner</small>{canManage?<select aria-label="Project owner" value={req.owner||''} onChange={e=>{
 const owner=e.target.value;
 commit('Changed project owner',(s,timestamp)=>({...s,requests:s.requests.map(r=>r.id===req.id?patchRecord(r,{owner},timestamp,'owner'):r)}));
 }}><option value="">Unassigned</option>{people.map(person=><option key={person}>{person}</option>)}</select>:<strong>{req.owner||'Unassigned'}</strong>}</div><div><small>Due</small><strong>{date(req.due)}</strong></div><div><small>Forecast finish</small><strong>{date(req.forecast)}</strong></div><div><small>Estimated active effort</small><strong>{formatMinutes(req.initialMinutes)}</strong></div></section>
 <div className="panel-header request-toolbar">
 {tabs(['Files & workflows','Escalations & defects',...(canSeeActivity?['Activity log']:[])],projectTab==='Tasks'?'Files & workflows':projectTab,setProjectTab)}
 {projectTab==='Escalations & defects'&&<button onClick={()=>setDialog({kind:'defect',request:req.id})}>New report</button>}
 {canManage&&['Tasks','Files & workflows'].includes(projectTab)&&<button className="primary" onClick={()=>setDialog({kind:'newfile',request:req.id})}>＋ Add file</button>}
 </div>
 {projectTab==='Activity log'&&canSeeActivity&&<ActivityLog key={req.id} entries={activity.filter(entry=>entry.requestIds.includes(req.id))} date={historyDate}/>}
 {projectTab==='Escalations & defects'&&<section className="panel">{defectTable(defects.filter(d=>d.request===req.id))}</section>}
 {['Tasks','Files & workflows'].includes(projectTab)&&<FileWorkflows files={requestFiles} tasks={requestTasks} account={req.account}
  openTask={id=>navigate('Task',id)} locked={isRunning} addTask={file=>setDialog({kind:'newtask',request:req.id,file})}
  addSubtask={addSubtask} canAddSubtask={canAddSubtask}
  {...{people,canManage,editable,changeTask,taskAction,statusBadge,statuses,date,zone,localValue,toInstant}}/>}
 <Metadata record={req} date={historyDate}/></>}
 {view==='Planning'&&canManage&&<>
 {canSeeResources&&<div className="planning-tabs">{tabs(['Dispatch','Team resources'],projectTab==='Team resources'?'Team resources':'Dispatch',setProjectTab)}</div>}
 {projectTab==='Team resources'&&canSeeResources ?
  <ResourceTimeline active={timers} {...{tasks,now,zone,date,navigate,toInstant,statuses}}/> :
  <section className="panel"><div className="panel-header filters">{searchInput('Search ready work')}{selectFilter(['All','Unassigned','Assigned'])}</div>{taskTable(tasks.filter(t=>!parents.has(t.id)&&phase(t.status)==='To-do'&&!taskBlocked(t)&&search(t.file,t.type,t.request)&&(filter==='All'||(filter==='Assigned')===Boolean(t.person))))}</section>}
 </>}
 {view==='Planning'&&!canManage&&canSeeResources&&<ResourceTimeline active={timers} {...{tasks,now,zone,date,navigate,toInstant,statuses}}/>}
 {view==='Profile'&&<ResourceTimeline key={profile} person={profile} active={timers} {...{tasks,now,zone,date,navigate,toInstant,statuses}}/>}
 {view==='Admin'&&role==='Manager'&&<>
 <TimelineAdmin access={timelineAccess} onChange={(name,enabled)=>setState(s=>({...s,timelineAccess:{...s.timelineAccess,[name]:enabled}}))}/>
 <StatusAdmin statuses={statuses} save={next=>setState(s=>({...s,statuses:next}))}/>
 <TimelineAdmin title="Activity log access" description="Choose which demo roles can review changes on requests and tasks."
  access={activityAccess} onChange={(name,enabled)=>setState(s=>({...s,activityAccess:{...s.activityAccess,[name]:enabled}}))}/>
 </>}
 {view==='My work'&&<section className="panel"><div className="panel-header filters">{tabs(['Table','Cards'],mode,setMode)}{<select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}><option value="All">All statuses</option>
 {['To-do','In progress','Complete'].map(group=><optgroup key={group} label={group}>{statuses.filter(status=>status.group===group).map(status=>
  <option key={status.id} value={status.id}>{status.label}</option>)}</optgroup>)}</select>}</div>{(()=>{const items=tasks.filter(t=>!parents.has(t.id)&&t.person===profile&&(filter==='All'||t.status===filter));return mode==='Table'?taskTable(items):<div className="task-cards">{items.map(t=><article key={t.id}><small>{t.type} · {t.request}</small><button className="link record" onClick={()=>navigate('Task',t.id)}>{t.file}</button>{statusBadge(t.status)}<p>{date(t.due)}</p>{taskAction(t)}</article>)}{!items.length&&<p className="empty">No matching tasks.</p>}</div>;})()}</section>}
 {view==='Task'&&task&&<><section className="panel details"><div className="panel-header"><div>{statusBadge(task.status)} <button className="link" onClick={()=>navigate('Request',task.request)}>{task.request}</button></div>{taskAction(task)}</div>
 <div className="properties"><div><small>Account</small><strong>{requestOf(task.request)?.account}</strong></div><div><small>Assignee</small>{taskIsParent?<strong>Subtasks only</strong>:canManage?<select aria-label="Task assignee" disabled={isRunning(task.id)}
 value={task.person} onChange={e=>changeTask(task.id,{person:e.target.value})}><option value="">Unassigned</option>{people.map(person=><option key={person}>{person}</option>)}</select>:<strong>{task.person||'Unassigned'}</strong>}</div><div><small>Due · {zone}</small>{canManage?<InlineDue task={task} zone={zone} localValue={localValue} toInstant={toInstant} save={fields=>changeTask(task.id,fields)}/>:<strong>{date(task.due)}</strong>}</div>
 {canManage&&<div><small>Task type</small><TaskSelect label="Task type" value={task.type} options={types} disabled={isRunning(task.id)} save={type=>changeTask(task.id,{type})}/></div>}
 {!taskIsParent&&editable(task)&&<div><small>Status</small><TaskStatus task={task} statuses={statuses} locked={isRunning(task.id)} blocked={taskBlocked(task)} save={fields=>changeTask(task.id,fields)}/></div>}
 {taskIsParent&&<div><small>Progress</small><strong>{tasks.filter(t=>t.parentTask===task.id&&phase(t.status)==='Complete').length} of {tasks.filter(t=>t.parentTask===task.id).length} subtasks complete</strong></div>}<div><small>Recorded effort</small><strong>{clock((task.spent??0)+(isRunning(task.id)?Math.max(0,Math.floor((now-timers.find(timer=>timer.id===task.id).started)/1000)):0))}</strong></div></div>
 {!taskIsParent&&<TaskFields key={task.id+':'+task.pages} task={task} account={requestOf(task.request)?.account} editable={editable(task)} save={pages=>{changeTask(task.id,{pages});setNotice('Page count saved');}}/>}
 {canManage&&!taskIsParent&&<ScheduleFields key={task.id} task={task} zone={zone} save={fields=>{
  changeTask(task.id,fields);setNotice('Schedule saved');
 }}/>}
 {task.parentTask&&<div className="note">Parent task <button className="link" onClick={()=>navigate('Task',task.parentTask)}>{task.parentTask}</button></div>}
 {task.dependsOn&&<div className="note">Depends on <button className="link" onClick={()=>navigate('Task',task.dependsOn)}>{task.dependsOn}</button></div>}</section>
 <Metadata record={task} date={historyDate}/>
 {canSeeActivity&&<details className="task-activity"><summary>Activity log</summary>
  <ActivityLog key={task.id} entries={activity.filter(entry=>entry.taskIds.includes(task.id))} date={historyDate}/>
 </details>}
 <SessionList task={task} active={timers} date={historyDate} clock={clock} now={now}/>
 {!task.parentTask&&<section className="panel"><div className="panel-header"><h2>Subtasks</h2>{canManage&&<button disabled={!canAddSubtask(task)} onClick={()=>addSubtask(workflowFiles.find(file=>file.id===task.fileId),task)}>Add subtask</button>}</div>{taskTable(tasks.filter(t=>t.parentTask===task.id))}</section>}
 <section className="panel"><div className="panel-header"><h2>Related defects</h2><button onClick={()=>setDialog({kind:'defect',request:task.request,task:task.id})}>New report</button></div>{defectTable(defects.filter(d=>d.task===task.id))}</section></>}
 {view==='Defects'&&<section className="panel"><div className="panel-header filters">{searchInput('Search defect reports')}{selectFilter(['All','Open','Under review','Closed'])}</div>{defectTable(defects.filter(d=>search(d.id,d.title,d.request)&&(filter==='All'||d.status===filter)))}</section>}
 {view==='Defect'&&defect&&<><section className="panel details"><div className="panel-header"><div>{badge(defect.status)} {badge(defect.severity)}</div><button onClick={()=>setDialog({kind:'defect',existing:defect})}>Edit report</button></div><div className="properties"><div><small>Related request</small><button className="link" onClick={()=>navigate('Request',defect.request)}>{requestOf(defect.request)?.title||defect.request}</button></div>{defect.task&&<div><small>Related task</small><button className="link" onClick={()=>navigate('Task',defect.task)}>{taskOf(defect.task)?.file||defect.task}</button></div>}</div><RcaBody record={defect}/></section><Metadata record={defect} date={historyDate}/></>}
 </>}</main><footer>Production Workspace <span>Prototype · Changes stay in this browser</span></footer>
 </div>
 {notice&&<div className="toast" role="status">{notice}</div>}
 {dialog&&dialog.kind!=='defect'&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null);}}><div className={'modal '+(dialog.kind==='rank'?'wide':'')} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
 <div className="dialog-head"><h2 id="dialog-title">{{request:'New request',rank:'Ranked operator suggestions',timer:'Another timer is running',newfile:'Add file',newtask:dialog.parent?'Add subtask':'Add file task'}[dialog.kind]}</h2><button aria-label="Close dialog" onClick={()=>setDialog(null)}>×</button></div>
 {dialog.kind==='request'&&<RequestForm zone={zone} save={values=>{
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
  if(workflowFiles.some(file=>file.request===dialog.request&&file.name===name)){
   input.setCustomValidity('This file is already on the request.');input.reportValidity();return;
  }
  const id='file-'+crypto.randomUUID();
  commit('Added file',(s,timestamp)=>({...s,workflowFiles:[...s.workflowFiles,
   {id,request:dialog.request,name,...audit(timestamp,profile)}]}));
  setDialog(null);setNotice('File added');
 }}><label>File name<input name="file" required maxLength="180" onInput={e=>e.currentTarget.setCustomValidity('')}/></label>
 <div className="actions"><button className="primary" type="submit">Add file</button></div></form>}
 {dialog.kind==='newtask'&&<form onSubmit={e=>{
  e.preventDefault();
  const d=new FormData(e.currentTarget);
  const id='FT-'+(Math.max(1056,...tasks.map(t=>Number(t.id.split('-')[1])))+1);
  const {parent,file}=dialog;
  if(parent&&!canAddSubtask(parent))return;
  const dependsOn=d.get('dependsOn')||null;
  commit(parent?'Added subtask':'Added task',(s,timestamp)=>({...s,tasks:[...s.tasks,{
   id,request:dialog.request,file:file.name,fileId:file.id,type:d.get('type'),
   parentTask:parent?.id,dependsOn,pages:d.get('pages')===''?null:Number(d.get('pages')),
   due:requestOf(dialog.request)?.due,status:dependsOn&&phase(taskOf(dependsOn)?.status)!=='Complete'?'Waiting':'Ready',
   person:d.get('person'),spent:0,sessions:[],...audit(timestamp,profile,Boolean(d.get('person'))),
  }]}));
  setDialog(null);setNotice(parent?'Subtask added':'Task added');
 }}><label>File<input value={dialog.file.name} readOnly/></label>
 <label>Task type<select name="type">{types.map(t=><option key={t}>{t}</option>)}</select></label>
 <label>Start after <select name="dependsOn"><option value="">No dependency</option>
 {predecessorChoices(dialog.file,dialog.parent).map(t=><option key={t.id} value={t.id}>{t.type} · {t.id}</option>)}</select></label>
 <label>Assignee <select name="person"><option value="">Unassigned</option>{people.map(person=><option key={person}>{person}</option>)}</select></label>
 <label>Page count<input name="pages" type="number" min="1" max="100000" placeholder="Optional"/></label>
 <div className="actions"><button type="submit" className="primary">{dialog.parent?'Add subtask':'Add task'}</button></div></form>}
 {dialog.kind==='timer'&&<><p>Pause or complete <strong>{activeTask?.file}</strong> before starting {dialog.target.file}.</p><div className="actions"><button onClick={()=>setDialog(null)}>Cancel</button><button className="primary" onClick={()=>stop()}>Pause current timer</button></div></>}
 {dialog.kind==='rank'&&(()=>{const t=dialog.task,account=requestOf(t.request)?.account,e=estimate(account,t.type,t.pages);return <><p>{t.file} · {account} · {formatMinutes(e.minutes)} · Due {date(t.due)}</p><div className="table-wrap"><table><thead><tr><th>Operator</th><th>Account training</th><th>Free before due</th><th>Earliest start</th><th>Due fit</th><th></th></tr></thead><tbody>{operatorRanking(account,t.due,e.minutes).map(p=><tr key={p.name}><td>{p.name}</td><td>{badge(p.trained?'Trained':'Untrained')}</td><td>{formatMinutes(p.free)}</td><td>{p.free>0?short(p.start):'—'}</td><td>{badge(p.fits==null?'Unknown':p.fits?'Fits':'Does not fit')}</td><td><button onClick={()=>{changeTask(t.id,{person:p.name});setDialog(null);setNotice('Assigned to '+p.name);}}>Assign</button></td></tr>)}</tbody></table></div><p className="note">Sample calendars rank by account training, then free time before due, then earliest start.</p></>;})()}

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
  <label>Scheduled start ({zone})<input name="start" type="datetime-local" defaultValue={localValue(task.scheduledStart,zone)}/></label>
  <label>Scheduled end ({zone})<input name="end" type="datetime-local" defaultValue={localValue(task.scheduledEnd,zone)}/></label>
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
function RequestForm({save,zone='Pacific'}){
 const [account,setAccount]=useState('Account A'),[files,setFiles]=useState(12),[counts,setCounts]=useState({Formatting:null,QC:null}),[error,setError]=useState('');
 const selected=Object.keys(counts);
 const rows=selected.map(t=>{const qty=counts[t]??files,e=estimate(account,t,null);return {type:t,qty,...e};});
 const partial=rows.some(r=>r.qty>0&&r.minutes===null);
 const sum=rows.reduce((total,r)=>total+(r.minutes??0)*r.qty,0);
 return <form onSubmit={e=>{e.preventDefault();if(!selected.length)return setError('Select at least one task type.');const d=new FormData(e.currentTarget);const due=toInstant(d.get('due'),zone);if(!due)return setError('Choose a valid local date and time.');save({title:d.get('title').trim(),account,files,types:selected,due,initialMinutes:partial?null:sum});}}>
 <label>Request title<input name="title" placeholder="e.g. Member handbook refresh" required maxLength="80"/></label>
 <div className="form-grid"><label>Account<select value={account} onChange={e=>setAccount(e.target.value)}>{['Account A','Account B','Account C'].map(a=><option key={a}>{a}</option>)}</select></label>
 <label>Planned files<input type="number" min="1" max="10000" required value={files} onChange={e=>{const qty=Number(e.target.value);setFiles(qty);setCounts(c=>Object.fromEntries(Object.entries(c).map(([t,n])=>[t,n===null?null:Math.min(n,qty)])));}}/></label></div>
 <label>Target due · {zone}<input type="datetime-local" name="due" defaultValue="2026-11-27T17:00" required/></label>
 <fieldset><legend>Task types</legend><div className="check-row">{types.map(t=><label key={t}><input type="checkbox" checked={t in counts} onChange={()=>setCounts(c=>{const next={...c};if(t in next)delete next[t];else next[t]=null;return next;})}/>{t}</label>)}</div></fieldset>
 <div className="table-wrap preview-table"><table><thead><tr><th>Task type</th><th>Files</th><th>Average / file</th><th>Effort</th></tr></thead><tbody>{rows.map(r=><tr key={r.type}><td>{r.type}</td><td><input aria-label={r.type+' applicable files'} type="number" min="1" max={files} required value={r.qty} onChange={e=>setCounts(c=>({...c,[r.type]:Number(e.target.value)}))}/></td><td>{formatMinutes(r.minutes)}{r.samples&&<small>{r.samples} historical files</small>}</td><td>{formatMinutes(r.minutes===null?null:r.qty*r.minutes)}</td></tr>)}</tbody></table></div>
 <div className="note"><strong>{partial?'Known subtotal':'Estimated active effort'}: {formatMinutes(sum)}</strong><br/>{partial?'Some task types have no matching history.':'Forecast finish depends on calendars and dependencies.'}</div>
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="actions"><button type="submit" className="primary">Create request</button></div>
 </form>;
}
createRoot(document.querySelector('#root')).render(<App/>);
