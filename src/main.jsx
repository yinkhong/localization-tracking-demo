import React, {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {demoRequests,demoTasks,demoDefects,estimate,formatMinutes,operatorRanking,types,zones} from './data';
import './style.css';

const sections=[['Overview','◫'],['Requests','▤'],['Planning','▦'],['My work','✓'],['Defects','◇']];
const palette={'In progress':'blue','Under review':'blue','Ready':'green','On track':'green','Complete':'green','Trained':'green','Fits':'green','At risk':'red','Major':'red','Waiting':'amber','Paused':'amber','Does not fit':'amber','Open':'amber','Unscheduled':'gray','Historical':'blue','Page-based':'green'};
const badge = name => <span className={'badge '+(palette[name]||'gray')}><i/>{name}</span>;
const clock = n => [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');
const fileName = s => s.split('.').pop().toUpperCase();
const dataKey='localization-workspace-v1';
function load(){try{const value=JSON.parse(localStorage.getItem(dataKey));if(value?.requests&&value?.tasks&&value?.defects)return value;}catch{}return {requests:demoRequests,tasks:demoTasks,defects:demoDefects,zone:'Pacific',active:null};}
function scrub(value){
 const doc=new DOMParser().parseFromString(value,'text/html');
 for(const node of [...doc.body.querySelectorAll('*')]){
  if(['SCRIPT','STYLE','IFRAME','IMG','OBJECT','SVG'].includes(node.tagName)){node.remove();continue;}
  for(const attr of [...node.attributes])node.removeAttribute(attr.name);
  if(!['B','STRONG','I','EM','U','BR','P','DIV','UL','OL','LI'].includes(node.tagName))node.replaceWith(...node.childNodes);
 }
 return doc.body.innerHTML;
}
function App(){
 const [state,setState]=useState(load),[view,setView]=useState('Overview'),[record,setRecord]=useState(''),[role,setRole]=useState('Manager'),[query,setQuery]=useState(''),[filter,setFilter]=useState('All'),[dialog,setDialog]=useState(null),[notice,setNotice]=useState(''),[now,setNow]=useState(Date.now()),[mode,setMode]=useState('Table'),[projectTab,setProjectTab]=useState('Tasks');
 const {requests,tasks,defects,zone,active}=state;
 useEffect(()=>{try{localStorage.setItem(dataKey,JSON.stringify(state));}catch{setNotice('Browser storage is full. These changes are available for this session.');}},[state]);
 useEffect(()=>{if(!active)return;const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[active]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),3200);return()=>clearTimeout(t);},[notice]);
 useEffect(()=>{const close=e=>{if(e.key==='Escape')setDialog(null);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[]);
 const date=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:zones[zone]||zones.Pacific,month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(v)):'—';
 const short=v=>v?new Intl.DateTimeFormat('en-US',{timeZone:zones[zone]||zones.Pacific,hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(new Date(v)):'—';
 const navigate=(next,id='')=>{setView(next);setRecord(id);setFilter('All');setQuery('');setProjectTab('Tasks');window.scrollTo(0,0);};
 const requestOf=id=>requests.find(r=>r.id===id);
 const taskOf=id=>tasks.find(t=>t.id===id);
 const req=requestOf(record), task=taskOf(record), defect=defects.find(d=>d.id===record);
 const activeTask=active&&taskOf(active.id);
 const elapsed=activeTask?activeTask.spent+Math.max(0,Math.floor((now-active.started)/1000)):0;
 const stats=[['Open requests',requests.filter(r=>r.status!=='Complete').length,'Across all sample accounts','▤'],['At risk',requests.filter(r=>r.risk==='At risk').length,'Needs PM attention','!'],['Ready to assign',tasks.filter(t=>t.status==='Ready'&&!t.person).length,'Unassigned operations','＋'],['Defects in review',defects.filter(d=>d.status!=='Closed').length,'Awaiting a decision','◇']];
 const editable=t=>role==='Manager'||role==='Team lead'||(role==='Operator'&&t?.person==='Alex');
 const changeTask=(id,update)=>setState(s=>({...s,tasks:s.tasks.map(t=>t.id===id?{...t,...update}:t)}));
 function start(t){
  if(active){if(active.id!==t.id)setDialog({kind:'timer',target:t});return;}
  if(t.status==='Waiting'||t.status==='Complete'||!t.person||!editable(t))return;
  const timestamp=Date.now();
  setNow(timestamp);
  setState(s=>({...s,active:{id:t.id,started:timestamp},tasks:s.tasks.map(item=>item.id===t.id?{...item,status:'In progress'}:item)}));
  setNotice('Timer started');
 }
 function stop(complete=false){
   if(!active)return;
   setState(s=>{
    const a=s.active;if(!a)return s;
    const updated=s.tasks.map(t=>t.id===a.id?{...t,spent:t.spent+Math.max(0,Math.floor((Date.now()-a.started)/1000)),status:complete?'Complete':'Paused'}:complete&&t.dependsOn===a.id&&t.status==='Waiting'?{...t,status:'Ready'}:t);
    return {...s,active:null,tasks:updated};
   });setDialog(null);setNotice(complete?'Task completed':'Timer paused');
 }
 const search=(...vals)=>vals.join(' ').toLowerCase().includes(query.toLowerCase());
 const riskSummary = requests.filter(r=>r.risk==='At risk');
 const selectFilter = options => <select aria-label="Filter status" value={filter} onChange={e=>setFilter(e.target.value)}>{options.map(x=><option key={x}>{x}</option>)}</select>;
 const searchInput = placeholder => <input className="search" aria-label={placeholder} placeholder={placeholder} value={query} onChange={e=>setQuery(e.target.value)}/>;
 const tabs = (values,selected,onSelect) => <div className="segments">{values.map(v=><button key={v} aria-pressed={selected===v} className={selected===v?'selected':''} onClick={()=>onSelect(v)}>{v}</button>)}</div>;
 function taskAction(t){
  if(active?.id===t.id)return <button onClick={()=>stop()}>Pause</button>;
  if(t.status==='Complete'||t.status==='Waiting'||!editable(t))return <button onClick={()=>navigate('Task',t.id)}>View</button>;
  if(!t.person)return <button onClick={()=>setDialog({kind:'rank',task:t})}>Suggest operator</button>;
  return <button onClick={()=>start(t)}>{t.status==='Paused'?'Resume':'Start timer'}</button>;
 }
 function requestTable(items){
  return <div className="table-wrap"><table><thead><tr><th>Request</th><th>Account</th><th>Due</th><th>Forecast</th><th>Status</th><th>Delivery risk</th></tr></thead><tbody>{items.map(r=><tr key={r.id}><td><button className="link record" onClick={()=>navigate('Request',r.id)}>{r.title}</button><small>{r.id} · {r.files} files</small></td><td>{r.account}</td><td>{date(r.due)}</td><td>{date(r.forecast)}</td><td>{badge(r.status)}</td><td>{badge(r.risk)}</td></tr>)}</tbody></table>{!items.length&&<div className="empty">No matching requests.</div>}</div>;
 }
 function taskTable(items){
  return <div className="table-wrap"><table><thead><tr><th>File / operation</th><th>Assignee</th><th>Due</th><th>Effort</th><th>Status</th><th>Action</th></tr></thead><tbody>{items.map(t=>{const e=estimate(requestOf(t.request)?.account,t.type,t.pages);return <tr key={t.id}><td><button className="link record" onClick={()=>navigate('Task',t.id)}>{t.file}</button><small>{t.type} · {t.id}</small></td><td>{t.person||'Unassigned'}</td><td>{date(t.due)}</td><td>{formatMinutes(e.minutes)}{e.source==='Historical'&&<small>Historical</small>}</td><td>{badge(t.status)}</td><td>{taskAction(t)}</td></tr>;})}</tbody></table>{!items.length&&<div className="empty">No matching tasks.</div>}</div>;
 }
 function defectTable(items){
 return <div className="table-wrap"><table><thead><tr><th>Finding</th><th>Related request</th><th>Severity</th><th>Status</th></tr></thead><tbody>{items.map(d=><tr key={d.id}><td><button className="link record" onClick={()=>navigate('Defect',d.id)}>{d.title}</button><small>{d.id}</small></td><td><button className="link" onClick={()=>navigate('Request',d.request)}>{d.request}</button></td><td>{badge(d.severity)}</td><td>{badge(d.status)}</td></tr>)}</tbody></table>{!items.length&&<div className="empty">No findings to show.</div>}</div>;
 }
 const primaryNav=sections.filter(([name])=>role!=='Operator'||['My work','Defects'].includes(name));
 const heading={Overview:['Delivery overview','Monitor commitments, available work, and quality in one place.'],Requests:['Requests','Manage project intake, effort estimates, and delivery commitments.'],Planning:['Team dispatch','Review ready work and choose an available operator.'],'My work':['My work','Review Alex’s assignments and record active work.'],Defects:['Escalations & defects','Review findings and trace them to the affected work.'],Request:[req?.title,req?.id+' · '+req?.account],Task:[task?.file,task?.id+' · '+task?.type],Defect:[defect?.title,defect?.id+' · Defect report']}[view];
 return <div className="app">
 <aside className="sidebar"><div className="brand"><span className="logo">L</span><span>Production<br/><small>Localization workspace</small></span></div>
 <nav aria-label="Main navigation">{primaryNav.map(([name,icon])=><button key={name} className={(view===name||view==='Request'&&name==='Requests'||view==='Task'&&name===(role==='Operator'?'My work':'Requests')||view==='Defect'&&name==='Defects')?'current':''} onClick={()=>navigate(name)}><span>{icon}</span>{name}</button>)}</nav>
 <div className="account"><span className="avatar">A</span><div><strong>Alex</strong><small>{role} · Demo</small></div></div>
 </aside>
 <div className="body">
 <header className="top"><div className="crumb">Workspace <span>/</span> {view}</div><div className="controls"><span className="demo-tag">Sample data</span><label>Role <select value={role} onChange={e=>{const r=e.target.value;setRole(r);navigate(r==='Operator'?'My work':'Overview');}}>{['Manager','Team lead','Operator'].map(x=><option key={x}>{x}</option>)}</select></label><label>Time zone <select value={zone} onChange={e=>setState(s=>({...s,zone:e.target.value}))}>{Object.keys(zones).map(z=><option key={z}>{z}</option>)}</select></label></div></header>
 <main>
 {['Request','Task','Defect'].includes(view)&&<button className="link back" onClick={()=>navigate(view==='Request'?'Requests':view==='Task'?(role==='Operator'?'My work':'Request'):'Defects',task?.request)}>‹ Back</button>}
 <div className="heading"><div><h1>{heading?.[0]}</h1><p>{heading?.[1]}</p></div>{(['Overview','Requests'].includes(view)&&role!=='Operator')&&<button className="primary" onClick={()=>setDialog({kind:'request'})}>＋ New request</button>}{view==='Defects'&&<button className="primary" onClick={()=>setDialog({kind:'defect'})}>＋ New report</button>}</div>
 {activeTask&&<div className="timer"><div>{badge('In progress')} <button className="link" onClick={()=>navigate('Task',activeTask.id)}>{activeTask.file} · {activeTask.type}</button></div><div><strong>{clock(elapsed)}</strong><button onClick={()=>stop()}>Pause</button><button className="primary" onClick={()=>stop(true)}>Complete</button></div></div>}
 {view==='Overview'&&<>
 <div className="metrics">{stats.map(([label,value,detail,icon])=><div className="metric" key={label}><div className="metric-top"><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{detail}</small></div>)}</div>
 <div className="overview-grid"><section className="panel chart"><div className="panel-header"><div><h2>Quality trend</h2><p>Confirmed defects per 100 inspected pages</p></div><span className="subtle">Last 4 weeks</span></div><div className="bars" aria-label="Example quality trend: 1.2, 0.9, 0.7, 0.6"><div className="chart-grid"/>{[1.2,.9,.7,.6].map((v,i)=><div className="bar-column" key={i}><div style={{height:(v/1.2)*86+'%'}} className="chart-bar"><span>{v.toFixed(1)}</span></div><small>Week {i+1}</small></div>)}</div></section>
 <section className="panel attention"><div className="panel-header"><div><h2>Needs attention</h2><p>Delivery risks and next actions</p></div></div>{riskSummary.map(r=><div className="attention-item" key={r.id}><div><button className="link record" onClick={()=>navigate('Request',r.id)}>{r.title}</button><small>{r.id} · Due {date(r.due)}</small></div>{badge('At risk')}</div>)}<div className="attention-item"><div><button className="link record" onClick={()=>navigate('Planning')}>Unassigned work</button><small>Review available operators</small></div>{badge('Ready')}</div><div className="attention-item"><div><button className="link record" onClick={()=>navigate('Defects')}>Defect review queue</button><small>Open related evidence and tasks</small></div>{badge('Under review')}</div></section></div>
 <section className="panel"><div className="panel-header"><h2>Recent requests</h2><button onClick={()=>navigate('Requests')}>View all requests</button></div>{requestTable(requests.slice(0,4))}</section></>}
 {view==='Requests'&&<section className="panel"><div className="panel-header filters">{searchInput('Search requests')}{selectFilter(['All','At risk','On track','Unscheduled'])}</div>{requestTable(requests.filter(r=>search(r.title,r.id,r.account)&&(filter==='All'||r.risk===filter)))}</section>}
 {view==='Request'&&req&&<><section className="panel summary"><div>{badge(req.status)} {badge(req.risk)}</div><div><small>Due</small><strong>{date(req.due)}</strong></div><div><small>Forecast finish</small><strong>{date(req.forecast)}</strong></div><div><small>Estimated active effort</small><strong>{formatMinutes(req.initialMinutes)}</strong></div></section><section className="panel"><div className="panel-header">{tabs(['Tasks','Escalations & defects'],projectTab,setProjectTab)}<button onClick={()=>setDialog(projectTab==='Tasks'?{kind:'newtask',request:req.id}:{kind:'defect',request:req.id})}>{projectTab==='Tasks'?'Add task':'New report'}</button></div>{projectTab==='Tasks'?taskTable(tasks.filter(t=>t.request===req.id)):defectTable(defects.filter(d=>d.request===req.id))}</section></>}
 {view==='Planning'&&<section className="panel"><div className="panel-header filters">{searchInput('Search ready work')}{selectFilter(['All','Unassigned','Assigned'])}</div>{taskTable(tasks.filter(t=>t.status==='Ready'&&search(t.file,t.type,t.request)&&(filter==='All'||(filter==='Assigned')===Boolean(t.person))))}</section>}
 {view==='My work'&&<section className="panel"><div className="panel-header filters">{tabs(['Table','Cards'],mode,setMode)}{selectFilter(['All','Ready','Waiting','In progress','Paused','Complete'])}</div>{(()=>{const items=tasks.filter(t=>t.person==='Alex'&&(filter==='All'||t.status===filter));return mode==='Table'?taskTable(items):<div className="task-cards">{items.map(t=><article key={t.id}><small>{t.type} · {t.request}</small><button className="link record" onClick={()=>navigate('Task',t.id)}>{t.file}</button>{badge(t.status)}<p>{date(t.due)}</p>{taskAction(t)}</article>)}{!items.length&&<p className="empty">No matching tasks.</p>}</div>;})()}</section>}
 {view==='Task'&&task&&<><section className="panel details"><div className="panel-header"><div>{badge(task.status)} <button className="link" onClick={()=>navigate('Request',task.request)}>{task.request}</button></div>{taskAction(task)}</div>
 <div className="properties"><div><small>Account</small><strong>{requestOf(task.request)?.account}</strong></div><div><small>Assignee</small><strong>{task.person||'Unassigned'}</strong></div><div><small>Due</small><strong>{date(task.due)}</strong></div><div><small>Recorded effort</small><strong>{clock(active?.id===task.id?elapsed:task.spent)}</strong></div></div>
 <TaskFields key={task.id+':'+task.pages} task={task} account={requestOf(task.request)?.account} editable={editable(task)} save={pages=>{changeTask(task.id,{pages});setNotice('Page count saved');}}/>
 {task.dependsOn&&<div className="note">Depends on <button className="link" onClick={()=>navigate('Task',task.dependsOn)}>{task.dependsOn}</button></div>}</section>
 <section className="panel"><div className="panel-header"><h2>Related defects</h2><button onClick={()=>setDialog({kind:'defect',request:task.request,task:task.id})}>New report</button></div>{defectTable(defects.filter(d=>d.task===task.id))}</section></>}
 {view==='Defects'&&<section className="panel"><div className="panel-header filters">{searchInput('Search defect reports')}{selectFilter(['All','Open','Under review','Closed'])}</div>{defectTable(defects.filter(d=>search(d.id,d.title,d.request)&&(filter==='All'||d.status===filter)))}</section>}
 {view==='Defect'&&defect&&<section className="panel details"><div className="panel-header"><div>{badge(defect.status)} {badge(defect.severity)}</div><button onClick={()=>setDialog({kind:'defect',existing:defect})}>Edit report</button></div><div className="properties"><div><small>Related request</small><button className="link" onClick={()=>navigate('Request',defect.request)}>{requestOf(defect.request)?.title||defect.request}</button></div>{defect.task&&<div><small>Related task</small><button className="link" onClick={()=>navigate('Task',defect.task)}>{taskOf(defect.task)?.file||defect.task}</button></div>}</div><div className="report-body"><h2>Description</h2><div dangerouslySetInnerHTML={{__html:scrub(defect.description)}}/><h2>Evidence</h2>{defect.attachments?.length?<ul>{defect.attachments.map((a,i)=><li key={i}><a download={a.name} href={a.url}>{a.name}</a></li>)}</ul>:<p>No attachments yet.</p>}</div></section>}
 </main><footer>Production Workspace <span>Prototype · Changes stay in this browser</span></footer>
 </div>
 {notice&&<div className="toast" role="status">{notice}</div>}
 {dialog&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setDialog(null);}}><div className={'modal '+(dialog.kind==='rank'?'wide':'')} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
 <div className="dialog-head"><h2 id="dialog-title">{{request:'New request',rank:'Ranked operator suggestions',timer:'Another timer is running',defect:dialog.existing?'Edit defect report':'New defect report',newtask:'Add file task'}[dialog.kind]}</h2><button aria-label="Close dialog" onClick={()=>setDialog(null)}>×</button></div>
 {dialog.kind==='request'&&<RequestForm zone={zone} save={values=>{const id='RQ-'+(Math.max(1045,...requests.map(r=>Number(r.id.split('-')[1])))+1);setState(s=>({...s,requests:[{...values,id,status:'Ready',risk:'Unscheduled',forecast:null,owner:'Alex'},...s.requests]}));setDialog(null);navigate('Request',id);setNotice('Request created');}}/>}
 {dialog.kind==='newtask'&&<form onSubmit={e=>{e.preventDefault();const d=new FormData(e.currentTarget);const id='FT-'+(Math.max(1056,...tasks.map(t=>Number(t.id.split('-')[1])))+1);setState(s=>({...s,tasks:[...s.tasks,{id,request:dialog.request,file:d.get('file').trim(),type:d.get('type'),pages:d.get('pages')===''?null:Number(d.get('pages')),due:requestOf(dialog.request)?.due,status:'Ready',person:'',spent:0}]}));setDialog(null);setNotice('Task added');}}><label>File name<input name="file" required/></label><label>Task type<select name="type">{types.map(t=><option key={t}>{t}</option>)}</select></label><label>Page count<input name="pages" type="number" min="1" placeholder="Optional"/></label><div className="actions"><button type="submit" className="primary">Add task</button></div></form>}
 {dialog.kind==='timer'&&<><p>Pause or complete <strong>{activeTask?.file}</strong> before starting {dialog.target.file}.</p><div className="actions"><button onClick={()=>setDialog(null)}>Cancel</button><button className="primary" onClick={()=>stop()}>Pause current timer</button></div></>}
 {dialog.kind==='rank'&&(()=>{const t=dialog.task,account=requestOf(t.request)?.account,e=estimate(account,t.type,t.pages);return <><p>{t.file} · {account} · {formatMinutes(e.minutes)} · Due {date(t.due)}</p><div className="table-wrap"><table><thead><tr><th>Operator</th><th>Account training</th><th>Free before due</th><th>Earliest start</th><th>Due fit</th><th></th></tr></thead><tbody>{operatorRanking(account,t.due,e.minutes).map(p=><tr key={p.name}><td>{p.name}</td><td>{badge(p.trained?'Trained':'Untrained')}</td><td>{formatMinutes(p.free)}</td><td>{p.free>0?short(p.start):'—'}</td><td>{badge(p.fits==null?'Unknown':p.fits?'Fits':'Does not fit')}</td><td><button onClick={()=>{changeTask(t.id,{person:p.name});setDialog(null);setNotice('Assigned to '+p.name);}}>Assign</button></td></tr>)}</tbody></table></div><p className="note">Sample calendars rank by account training, then free time before due, then earliest start.</p></>;})()}
 {dialog.kind==='defect'&&<DefectForm key={dialog.existing?.id||'new'} requests={requests} tasks={tasks} config={dialog} save={values=>{const id=dialog.existing?.id||'DF-'+String(Math.max(87,...defects.map(d=>Number(d.id.split('-')[1])))+1).padStart(4,'0');setState(s=>({...s,defects:dialog.existing?s.defects.map(d=>d.id===id?{...values,id}:d):[{...values,id},...s.defects]}));setDialog(null);navigate('Defect',id);setNotice('Defect report saved');}}/>}
 </div></div>}
 </div>;
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
function toInstant(value,zone){
 const target=Date.parse(value+'Z');
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
function DefectForm({requests,tasks,config,save}){
 const initial=config.existing;
 const [request,setRequest]=useState(initial?.request||config.request||requests[0]?.id||''),[task,setTask]=useState(initial?.task||config.task||''),[files,setFiles]=useState(initial?.attachments||[]),[error,setError]=useState('');
 const editor=React.useRef(null);
 useEffect(()=>{editor.current.innerHTML=scrub(initial?.description||'');},[initial]);
 async function attach(uploads){
  const accepted=[...uploads];
  if(!accepted.length)return;
  if(accepted.some(f=>f.size>350000)||accepted.length+files.length>3){setError('Choose up to 3 sample files, each no larger than 350 KB.');return;}
  try{const more=await Promise.all(accepted.map(f=>new Promise((ok,fail)=>{const reader=new FileReader();reader.onerror=fail;reader.onload=()=>ok({name:f.name,url:'data:application/octet-stream;base64,'+String(reader.result).split(',')[1]});reader.readAsDataURL(f);})));setFiles(a=>[...a,...more].slice(0,3));setError('');}
  catch{setError('This file could not be read.');}
 }
 return <form onSubmit={e=>{e.preventDefault();const form=new FormData(e.currentTarget);if(!editor.current.innerText.trim())return setError('Enter a description.');save({title:form.get('title').trim(),request,task,severity:form.get('severity'),status:form.get('status'),description:scrub(editor.current.innerHTML),attachments:files});}}>
 <label>Finding title<input required name="title" defaultValue={initial?.title} maxLength="80"/></label>
 <div className="form-grid"><label>Related request<select value={request} onChange={e=>{setRequest(e.target.value);setTask('');}}>{requests.map(r=><option key={r.id} value={r.id}>{r.id} · {r.title}</option>)}</select></label><label>Related task<select value={task} onChange={e=>setTask(e.target.value)}><option value="">Request only</option>{tasks.filter(t=>t.request===request).map(t=><option value={t.id} key={t.id}>{t.file} · {t.type}</option>)}</select></label></div>
 <div className="form-grid"><label>Severity<select name="severity" defaultValue={initial?.severity||'Major'}>{['Minor','Major','Critical'].map(s=><option key={s}>{s}</option>)}</select></label><label>Status<select name="status" defaultValue={initial?.status||'Open'}>{['Open','Under review','Closed'].map(s=><option key={s}>{s}</option>)}</select></label></div>
 <div className="editor"><div className="editor-tools" aria-label="Description formatting">{[['Bold','bold'],['Italic','italic'],['List','insertUnorderedList']].map(([name,action])=><button key={name} type="button" onMouseDown={e=>e.preventDefault()} onClick={()=>{editor.current.focus();document.execCommand(action);}}>{name}</button>)}</div><div ref={editor} contentEditable suppressContentEditableWarning role="textbox" aria-label="Description" aria-multiline="true" onPaste={ev=>{ev.preventDefault();if(ev.clipboardData.files.length)attach(ev.clipboardData.files);else document.execCommand('insertText',false,ev.clipboardData.getData('text/plain'));}}/></div>
 <label>Evidence <small>Paste a screenshot into the description or attach sample files.</small><input type="file" multiple onChange={e=>{attach(e.target.files);e.target.value='';}}/></label>
 {files.map((f,i)=><div key={i} className="attachment">{f.name}<button type="button" aria-label={'Remove '+f.name} onClick={()=>setFiles(a=>a.filter((_,j)=>j!==i))}>Remove</button></div>)}
 {error&&<p className="error" role="alert">{error}</p>}
 <div className="actions"><button type="submit" className="primary">Save report</button></div>
 </form>;
}
createRoot(document.querySelector('#root')).render(<App/>);
