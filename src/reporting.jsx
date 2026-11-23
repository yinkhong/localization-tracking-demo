import React, {useState} from 'react';
import {estimate, formatMinutes, zones} from './data';
import {parentTaskIds,statusGroup} from './status';
import {groups} from './timeline';

function operatorTeams(person,type,roster){
 const memberships=roster.filter(group=>group.members.includes(person));
 const preferred={QC:'QC',Formatting:'DTP',Preflight:'DTP',Audio:'Audio',Braille:'Braille'}[type];
 const matching=memberships.filter(group=>group.team===preferred);
 return [...new Set((matching.length?matching:memberships).map(group=>group.team))];
}

export function reportRows(requests,tasks,filters,view,taskStatuses,requestStatuses,zone,roster=groups){
 const {account,operator,team,type,from,to,status,dateField='due'}=filters;
 const day=value=>value==null?'':new Intl.DateTimeFormat('en-CA',{timeZone:zones[zone],year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const matchesDate=row=>{
  if(!from&&!to)return true;
  const date=day(row[dateField]);
  return Boolean(date&&(!from||date>=from)&&(!to||date<=to));
 };
 const parents=parentTaskIds(tasks);
 const requestById=new Map(requests.map(row=>[row.id,row]));
 const taskRows=tasks.map(task=>({...task,account:requestById.get(task.request)?.account??'',
  operator:task.person||'',teams:operatorTeams(task.person,task.type,roster),
  effort:parents.has(task.id)?null:estimate(requestById.get(task.request)?.account,task.type,task.pages).minutes,
  minutes:(task.spent??0)/60,phase:statusGroup(taskStatuses,task.status)}));
 const matchesTask=row=>(!operator||row.operator===operator)&&(!team||row.teams.includes(team))&&(!type||row.type===type);
 const matchesCommon=row=>(!account||row.account===account)&&(!status||row.status===status)&&matchesDate(row);
 if(view==='Tasks')return taskRows.filter(row=>matchesCommon(row)&&matchesTask(row));
 return requests.flatMap(request=>{
  if(!matchesCommon(request))return [];
  const related=taskRows.filter(task=>task.request===request.id);
  const matched=related.filter(matchesTask);
  const plannedTypeMatches=type&&!operator&&!team&&request.types?.includes(type);
  if((operator||team||type)&&!matched.length&&!plannedTypeMatches)return [];
  const included=operator||team||type?matched:related;
  return [{...request,effort:request.initialMinutes,phase:statusGroup(requestStatuses,request.status),
   operators:[...new Set(included.map(task=>task.operator).filter(Boolean))],
   teams:[...new Set(included.flatMap(task=>task.teams))],
   typeIds:[...new Set([...(operator||team?[]:type&&plannedTypeMatches?[type]:type?[]:request.types??[]),...included.map(task=>task.type).filter(Boolean)])],
   minutes:included.reduce((sum,item)=>sum+item.minutes,0)}];
 });
}

export function Reporting({requests,tasks,taskStatuses,requestStatuses,taskTypes,people,typeLabel,date,zone,navigate,teamGroups=groups,accountLabel=id=>id}){
 const [view,setView]=useState('Tasks');
 const [filters,setFilters]=useState({});
 const [sort,setSort]=useState({key:'due',ascending:true});
 const statuses=view==='Tasks'?taskStatuses:requestStatuses;
 const label=id=>statuses.find(status=>status.id===id)?.label??id;
 const rows=reportRows(requests,tasks,filters,view,taskStatuses,requestStatuses,zone,teamGroups);
 const columns=view==='Tasks'?
  [['title','Task'],['account','Account'],['operator','Operator'],['teams','Team'],['type','Task type'],['status','Status'],['due','Due'],['modifiedAt','Last updated'],['effort','Est. effort'],['minutes','Recorded time']]:
  [['title','Request'],['account','Account'],['owner','Owner'],['operators','Operators'],['teams','Teams'],['typeIds','Task types'],['status','Status'],['due','Due'],['modifiedAt','Last updated'],['effort','Est. effort'],['minutes','Recorded time']];
 const filter=(key,name,options)=><label>{name}<select value={filters[key]||''}
  onChange={event=>setFilters(previous=>({...previous,[key]:event.target.value}))}>
  <option value="">All</option>{options.map(([key,value])=><option key={key} value={key}>{value}</option>)}
 </select></label>;
 const sortValue=(row,key)=>{
  if(key==='title')return row.title??row.file;
  if(key==='account')return accountLabel(row.account);
  if(key==='status')return label(row.status);
  if(key==='type')return typeLabel(row.type);
  if(key==='typeIds')return row.typeIds.map(typeLabel).sort().join(', ');
  if(key==='due'||key==='modifiedAt')return row[key]==null?null:new Date(row[key]).getTime();
  return row[key];
 };
 const sorted=[...rows].sort((a,b)=>{
  const x=sortValue(a,sort.key),y=sortValue(b,sort.key);
  if(x==null||y==null)return x==null&&y==null?0:x==null?1:-1;
  return (sort.ascending?1:-1)*(typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y)));
 });
 const phases=['To-do','In progress','Complete'].map(phase=>[phase,rows.filter(row=>row.phase===phase).length]);
 const asOptions=items=>[...new Set(items)].sort().map(item=>[item,item]);
 return <section className="panel report-dashboard">
  <div className="panel-header"><div className="tabs">{['Tasks','Requests'].map(name=><button key={name} aria-pressed={view===name}
    onClick={()=>{setView(name);setFilters(previous=>({...previous,status:''}));setSort({key:'due',ascending:true});}}>{name}</button>)}</div>
   <button onClick={()=>setFilters({})}>Clear filters</button></div>
  <div className="report-filters">
   {filter('account','Account',asOptions(requests.map(item=>item.account)).map(([id])=>[id,accountLabel(id)]))}
   {filter('operator','Operator',asOptions([...people,...tasks.map(item=>item.person).filter(Boolean)]))}
   {filter('team','Team',asOptions(teamGroups.map(group=>group.team)))}
   {filter('type','Task type',taskTypes.map(item=>[item.id,item.label]))}
   {filter('status','Status',statuses.map(item=>[item.id,item.label]))}
   <label>Date field<select value={filters.dateField||'due'} onChange={event=>setFilters({...filters,dateField:event.target.value})}>
    <option value="due">Due date</option><option value="createdAt">Created date</option><option value="modifiedAt">Last updated</option></select></label>
   {['from','to'].map(key=><label key={key}>{key==='from'?'From':'Through'}<input type="date" value={filters[key]||''}
    onChange={event=>setFilters({...filters,[key]:event.target.value})}/></label>)}
  </div>
  <div className="report-summary">
   <div><small>{view} shown</small><strong>{rows.length}</strong></div>
   <div><small>Recorded time</small><strong>{formatMinutes(Math.round(rows.reduce((sum,row)=>sum+row.minutes,0)))}</strong></div>
   <div className="report-phase-chart">{phases.map(([phase,count])=><div key={phase}><span>{phase}</span><meter min="0" max={Math.max(rows.length,1)} value={count} aria-label={phase}/><strong>{count}</strong></div>)}</div>
  </div>
  <div className="table-wrap"><table><thead><tr>{columns.map(([key,title])=><th key={key} aria-sort={sort.key===key?(sort.ascending?'ascending':'descending'):'none'}>
   <button onClick={()=>setSort(previous=>({key,ascending:previous.key===key?!previous.ascending:true}))}>{title}{sort.key===key?(sort.ascending?' ↑':' ↓'):''}</button>
  </th>)}</tr></thead><tbody>{sorted.map(row=><tr key={row.id}>{columns.map(([key])=><td key={key}>{key==='title'?
   <><button className="link record" onClick={()=>navigate(view==='Tasks'?'Task':'Request',row.id)}>{row.title??row.file}</button><small>{row.id}</small></>:
   key==='due'||key==='modifiedAt'?date(row[key]):key==='minutes'||key==='effort'?formatMinutes(row[key]==null?null:Math.round(row[key])):
   key==='account'?accountLabel(row.account):key==='type'?typeLabel(row.type):key==='typeIds'?row.typeIds.map(typeLabel).sort().join(', ')||'—':key==='status'?label(row.status):Array.isArray(row[key])?row[key].join(', ')||'—':row[key]||'—'}</td>)}</tr>)}</tbody></table>
   {!sorted.length&&<p className="empty">No records match these filters.</p>}</div>
 </section>;
}
