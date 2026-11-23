import React, {useState} from 'react';
import {groups} from './timeline';

export const defectStatuses=['Open','Under review','Closed'];
export const defectSeverities=['Minor','Major','Critical'];
export const reviewRoles=['Team lead','PM','Manager'];
export const rcaSteps={
 description:'Incident summary',steps:'Steps & operators',rootCause:'Root cause',
 corrective:'Corrective actions',preventive:'Preventive actions',
};
const signableFields=['title','request','task','relatedTasks','severity','filePath',...Object.keys(rcaSteps),'attachments'];

export function defectAttribution(request,task,requests,tasks){
 const linked=tasks.find(item=>item.id===task&&item.request===request);
 const operator=linked?.person||'';
 const teamHint={Preflight:'DTP',Formatting:'DTP',QC:'QC',Audio:'Audio',Braille:'Braille'}[linked?.type];
 const memberships=groups.filter(group=>group.members.includes(operator));
 return {operator,team:(memberships.find(group=>group.team===teamHint)??memberships[0])?.team||'',
  account:requests.find(item=>item.id===request)?.account||''};
}

export function defectRevision(record,fields){
 const changed=signableFields.some(key=>Object.hasOwn(fields,key)&&
  JSON.stringify(fields[key]??'')!==JSON.stringify(record[key]??''));
 return (record.revision??1)+(changed?1:0);
}

export function bootstrapDefects(state){
 return {...state,defects:state.defects.map(record=>({
  assignedTo:'',reviewedBy:'',revision:1,acknowledgments:[],relatedTasks:[],
  ...defectAttribution(record.request,record.task,state.requests,state.tasks),...record,
 }))};
}

export function currentAcknowledgment(record){
 return record.acknowledgments?.findLast(entry=>entry.revision===record.revision&&entry.operator===record.operator);
}

export function canEditDefect(record,profile,role){
 return record.status!=='Closed'&&(reviewRoles.includes(role)||record.createdBy===profile);
}

export function defectChanges(record,fields,context,action){
 const {profile,role,profiles,requests,tasks,timestamp}=context;
 if(action==='reopen'){
  return record.status==='Closed'&&role==='Manager'?{status:'Under review'}:null;
 }
 if(action==='sign'){
  return record.status!=='Closed'&&record.operator===profile&&fields.signature===profile&&!currentAcknowledgment(record)
   ? {acknowledgments:[...record.acknowledgments,{operator:profile,signature:profile,revision:record.revision,signedAt:timestamp}]}:null;
 }
 if(!canEditDefect(record,profile,role))return null;
 const updates={...fields};
 const canReview=reviewRoles.includes(role);
 for(const key of ['status','severity','assignedTo','reviewedBy']){
  if(!Object.hasOwn(updates,key))continue;
  if(!canReview&&updates[key]!==record[key])return null;
  if(['assignedTo','reviewedBy'].includes(key)&&updates[key]&&updates[key]!==record[key]&&
     !reviewRoles.includes(profiles[updates[key]]?.role))return null;
 }
 if((updates.status&&!defectStatuses.includes(updates.status))||(updates.severity&&!defectSeverities.includes(updates.severity)))return null;
 if((Object.hasOwn(updates,'request')&&updates.request!==record.request)||
    (Object.hasOwn(updates,'task')&&updates.task!==record.task)){
  const request=updates.request??record.request,task=updates.task??record.task;
  if(!requests.some(item=>item.id===request)||task&&!tasks.some(item=>item.id===task&&item.request===request))return null;
  Object.assign(updates,defectAttribution(request,task,requests,tasks));
 }
 if(Object.hasOwn(updates,'relatedTasks')){
  const request=updates.request??record.request,task=updates.task??record.task;
  updates.relatedTasks=[...new Set(updates.relatedTasks)].filter(id=>id!==task);
  if(updates.relatedTasks.some(id=>!tasks.some(item=>item.id===id&&item.request===request)))return null;
 }
 updates.revision=defectRevision(record,updates);
 return Object.fromEntries(Object.entries(updates).filter(([key,value])=>JSON.stringify(value??'')!==JSON.stringify(record[key]??'')));
}

export function ReviewSelect({label,values,value,onChange,disabled=false,placeholder}){
 return <select aria-label={label} value={value??''} disabled={disabled} onChange={event=>onChange(event.target.value)}>
  {placeholder&&<option value="">{placeholder}</option>}
  {values.map(item=><option key={item}>{item}</option>)}
 </select>;
}

export function Acknowledgment({record,profile,date,sign}){
 const [name,setName]=useState('');
 const [accepted,setAccepted]=useState(false);
 const current=currentAcknowledgment(record);
 const archived=record.acknowledgments.filter(entry=>entry!==current);
 const canSign=record.operator===profile&&record.status!=='Closed'&&!current;
 return <section className="panel acknowledgment"><div className="panel-header"><h2>Operator acknowledgment</h2></div>
  <div className="review-padding">
  {current?<p><strong>{current.signature}</strong> accepted revision {current.revision} on {date(current.signedAt)}.</p>:
   <p>{record.operator?'Awaiting acknowledgment from '+record.operator+'.':'Link an assigned task to identify the signing operator.'}</p>}
  {canSign&&<form onSubmit={e=>{e.preventDefault();if(accepted&&name.trim()===profile)sign(name.trim());}}>
   <label>Type your profile name<input aria-label="Signature name" value={name} onChange={e=>setName(e.target.value)} required /></label>
   <label className="signature-consent"><input type="checkbox" required checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>
    I acknowledge and accept this RCA report.</label>
   <button className="primary" disabled={!accepted||name.trim()!==profile}>Sign acknowledgment</button>
  </form>}
  {archived.length>0&&<details><summary>Previous acknowledgments</summary><ul>{archived.map((entry,index)=>
   <li key={index}>{entry.signature} signed revision {entry.revision} · {date(entry.signedAt)}</li>)}</ul></details>}
  </div>
 </section>;
}

export function RcaTimeline({record,entries,date}){
 const statusOrder=defectStatuses.indexOf(record.status);
 const hasCreation=entries.some(entry=>entry.action==='Created defect report');
 const history=entries.map(entry=>{
  const status=entry.changes.find(change=>change.key==='status');
  const steps=entry.changes.filter(change=>Object.hasOwn(rcaSteps,change.key)).map(change=>rcaSteps[change.key]);
  const followups=entry.changes.filter(change=>['assignedTo','reviewedBy'].includes(change.key)).map(change=>
   (change.key==='assignedTo'?'Assigned to ':'Reviewed by ')+(change.to||'—'));
  return {...entry,summary:[status?(status.from?status.from+' → ':'')+status.to:'',...followups,...steps].filter(Boolean).join(' · '),
   stage:status?'status':steps.length?'step':'event'};
 });
 if(!hasCreation&&record.createdAt)history.push({action:'Report created',actor:record.createdBy,timestamp:record.createdAt,stage:'event'});
 return <aside className="panel rca-timeline"><div className="panel-header"><h2>RCA timeline</h2></div>
  <ol className="rca-progress" aria-label="RCA status progress">{defectStatuses.map((status,index)=><li key={status}
   className={index<=statusOrder?'reached':''} aria-current={index===statusOrder?'step':undefined}>{status}</li>)}</ol>
  <ol className="rca-events" aria-label="RCA milestones">
   {history.length?history.map((entry,index)=><li key={index} className={entry.stage}>
    <strong>{entry.action}</strong>{entry.summary&&<p>{entry.summary}</p>}
    <small>{date(entry.timestamp)}{entry.actor?' · '+entry.actor:''}</small>
   </li>):<li>Activity will appear here as this report changes.</li>}
  </ol>
 </aside>;
}

export function DefectPerformance({records,profiles}){
 const [dimension,setDimension]=useState('Operator');
 const [account,setAccount]=useState('All accounts');
 const [team,setTeam]=useState('All teams');
 const accounts=[...new Set(records.map(record=>record.account).filter(Boolean))].sort();
 const teams=[...new Set(groups.map(group=>group.team))].sort();
 const shown=records.filter(record=>(account==='All accounts'||record.account===account)&&(team==='All teams'||record.team===team));
 const keys=(dimension==='Operator'?Object.keys(profiles).filter(person=>team==='All teams'||groups.some(group=>group.team===team&&group.members.includes(person))):
  dimension==='Team'?(team==='All teams'?teams:[team]):(account==='All accounts'?accounts:[account]));
 const counts=new Map(keys.map(key=>[key,{total:0,open:0,critical:0,acknowledged:0}]));
 for(const record of shown){
  const name=record[dimension.toLowerCase()]||'Unspecified';
  const values=counts.get(name)??{total:0,open:0,critical:0,acknowledged:0};
  values.total++;
  values.open+=Number(record.status!=='Closed');
  values.critical+=Number(record.severity==='Critical');
  values.acknowledged+=Number(Boolean(currentAcknowledgment(record)));
  counts.set(name,values);
 }
 const max=Math.max(1,...[...counts.values()].map(values=>values.total));
 return <section className="panel defect-performance">
  <div className="panel-header"><div><h2>RCA performance reporting</h2>
   <p>Reported defect counts by linked operator, team, or account.</p></div>
   <div className="timeline-controls">
    <label>Group by<ReviewSelect label="Group RCA reports by" values={['Operator','Team','Account']} value={dimension} onChange={setDimension}/></label>
    <label>Team<ReviewSelect label="Filter RCA by team" values={['All teams',...teams]} value={team} onChange={setTeam}/></label>
    <label>Account<ReviewSelect label="Filter RCA by account" values={['All accounts',...accounts]} value={account} onChange={setAccount}/></label>
   </div></div>
  {counts.size>0?<div className="table-wrap"><table><thead><tr><th>{dimension}</th><th>Reports</th><th>Open</th><th>Critical</th><th>Acknowledged</th></tr></thead>
   <tbody>{[...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,values])=><tr key={name}><th scope="row">{name}</th>
    <td className="defect-bar-cell"><span>{values.total}</span><span className="defect-bar" aria-hidden="true"><i style={{width:values.total/max*100+'%'}}/></span></td>
    <td>{values.open}</td><td>{values.critical}</td><td>{values.acknowledged}</td></tr>)}</tbody></table></div>:
   <p className="empty">No reports match these filters.</p>}
 </section>;
}
