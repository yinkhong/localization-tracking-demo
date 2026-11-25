import React, {useEffect,useRef,useState} from 'react';
import {groups} from './timeline';
import {normalizeTeamGroups,qualificationLevels,teamLabel,teamMembers,updateMemberships} from './team-memberships';

const pageSize=25;
export const defaultTeamGroups=normalizeTeamGroups(groups.map(({team,name,members})=>({id:team+'/'+name,team,name,members,lead:''})));
const levelFor=(group,name)=>group.qualifications?.[name]??'Not set';
const levelColors={'Not set':'gray','In training':'amber','Independent':'green','Trainer':'blue'};
const ordered=groups=>[...groups].sort((a,b)=>teamLabel(a).localeCompare(teamLabel(b)));

export function TeamOrg({groups,profiles,save,editable}){
 const people=Object.keys(profiles).sort((a,b)=>a.localeCompare(b));
 const roots=ordered(groups.filter(group=>group.kind==='team'));
 const leads=people.filter(name=>['Team lead','PM','Manager'].includes(profiles[name].role));
 const [view,setView]=useState('Member list');
 const [chosen,setChosen]=useState('');
 const [editor,setEditor]=useState(null);
 const [branch,setBranch]=useState('');
 const [message,setMessage]=useState('');
 const memberHeading=useRef(null),editorHeading=useRef(null);
 useEffect(()=>{if(editor)editorHeading.current?.focus();else if(chosen)memberHeading.current?.focus();},[editor,chosen]);
 const selectedBranch=groups.find(group=>group.id===branch);
 const searchMatches=(name,value)=>(name+' '+(profiles[name]?.email??'')).toLowerCase().includes(value.trim().toLowerCase());
 const update=(groupId,names,level,operation)=>{
  if(!editable)return;
  save(current=>updateMemberships(current,groupId,names,level,operation));
 };
 return <div className="team-org">
  <section className="panel">
   <div className="panel-header filters"><div className="segments" aria-label="Team view">
    {['Member list','Org chart'].map(name=><button key={name} aria-pressed={view===name}
     onClick={()=>{setView(name);setEditor(null);setChosen('');setMessage('');}}>{name}</button>)}
   </div></div>
   {view==='Member list'?
    <MemberList {...{people,profiles,groups,editable,chosen,searchMatches}} onChoose={name=>{setChosen(name);setEditor(null);setMessage('');}}
     onEdit={(names,operation)=>{setChosen('');setEditor({names,operation});setMessage('');}}/>:
    <div className="team-chart-layout">
     <div className="team-tree" aria-label="Team hierarchy">
      {roots.map(root=><details key={root.id}>
       <summary><strong>{root.team}</strong><span>{teamMembers(groups,root.team).length} members · {root.lead||'Lead unassigned'}</span></summary>
       <div className="team-tree-children">
        <button aria-pressed={branch===root.id} onClick={()=>{setBranch(root.id);setEditor(null);setMessage('');}}>View {root.team} roster</button>
        {ordered(groups.filter(group=>group.team===root.team&&group.kind!=='team')).map(group=>
         <button key={group.id} aria-pressed={branch===group.id} onClick={()=>{setBranch(group.id);setEditor(null);setMessage('');}}>
          <strong>{group.name}</strong><small>{group.members.length} members · {group.lead||'Lead unassigned'}</small>
         </button>)}
       </div>
      </details>)}
      {!roots.length&&<p className="empty">No teams created yet.</p>}
     </div>
     {selectedBranch?<BranchRoster key={selectedBranch.id} group={selectedBranch} {...{groups,people,editable,leads,searchMatches}}
      onAdd={()=>{setEditor({destination:selectedBranch.id,operation:'add'});setMessage('');}}
      onLead={lead=>save(current=>current.map(group=>group.id===selectedBranch.id?{...group,lead}:group))}
      onQualification={(person,level)=>update(selectedBranch.id,[person],level,'edit')}
      onRemove={person=>update(selectedBranch.id,[person],'Not set','remove')}/>:
      <p className="empty">Expand a team and choose its roster or a subteam.</p>}
    </div>}
   {message&&<p className="note" role="status">{message}</p>}
   {chosen&&editable&&<div className="team-assignment-panel">
    <div className="team-assignment-title"><h3 ref={memberHeading} tabIndex={-1}>{chosen}’s assignments</h3><button onClick={()=>setChosen('')}>Done</button></div>
    <div className="team-person-assignments">{ordered(groups.filter(group=>group.members.includes(chosen))).map(group=>
     <div key={group.id}><strong>{teamLabel(group)}</strong>
      <Qualification value={levelFor(group,chosen)} label={'Qualification in '+teamLabel(group)}
       change={level=>update(group.id,[chosen],level,'edit')}/>
      <button aria-label={'Remove '+chosen+' from '+teamLabel(group)} onClick={()=>update(group.id,[chosen],'Not set','remove')}>Remove</button>
     </div>)}</div>
    <button className="primary" onClick={()=>{setEditor({names:[chosen],operation:'add'});setMessage('');}}>Add assignment</button>
   </div>}
   {editor&&editable&&<AssignmentEditor key={[view,editor.destination,editor.operation,editor.names?.join('/')].join(':')}
    {...{people,groups,searchMatches}} headingRef={editorHeading} options={editor} cancel={()=>setEditor(null)} apply={(destination,names,level)=>{
     update(destination,names,level,editor.operation);
     setMessage(editor.operation==='add'?('Added '+names.length+(names.length===1?' assignment.':' assignments.')):'Updated qualifications.');
     setEditor(null);
    }}/>}
  </section>
  {editable&&<TeamSetup {...{roots,groups,save}}/>}
 </div>;
}

function MemberList({people,profiles,groups,editable,chosen,searchMatches,onChoose,onEdit}){
 const [query,setQuery]=useState('');
 const [destination,setDestination]=useState('');
 const [qualification,setQualification]=useState('');
 const [selected,setSelected]=useState([]);
 const [page,setPage]=useState(0);
 const scope=groups.find(group=>group.id===destination);
 const assignmentsByPerson=new Map();
 for(const group of ordered(groups))for(const name of group.members){
  if(!assignmentsByPerson.has(name))assignmentsByPerson.set(name,[]);
  assignmentsByPerson.get(name).push(group);
 }
 const filtered=people.filter(name=>{
  const assignments=assignmentsByPerson.get(name)??[];
  const matches=assignments.filter(group=>!scope||(scope.kind==='team'?group.team===scope.team:group.id===scope.id));
  return searchMatches(name,query)&&(!scope||matches.length>0)&&
   (!qualification||matches.some(group=>levelFor(group,name)===qualification));
 });
 const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/pageSize)-1));
 const visible=filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize);
 return <>
  <div className="team-filters">
   <label>Find members<input type="search" value={query} placeholder="Name or email" onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>
   <label>Team or subteam<select value={destination} onChange={event=>{setDestination(event.target.value);setPage(0);}}>
    <option value="">All teams</option>{ordered(groups).map(group=><option value={group.id} key={group.id}>{teamLabel(group)}</option>)}</select></label>
   <label>Qualification<select value={qualification} onChange={event=>{setQualification(event.target.value);setPage(0);}}>
    <option value="">All levels</option>{qualificationLevels.map(level=><option key={level}>{level}</option>)}</select></label>
  </div>
  {editable&&selected.length>0&&<div className="team-selection">
   <strong>{selected.length} selected</strong><button className="primary" onClick={()=>onEdit(selected,'add')}>Assign selected</button>
   <button onClick={()=>onEdit(selected,'edit')}>Set qualification</button><button onClick={()=>setSelected([])}>Clear selection</button>
  </div>}
  <div className="table-wrap"><table className="team-members-table"><thead><tr>{editable&&<th scope="col">Select</th>}<th scope="col">Member</th>
   <th scope="col">Role</th><th scope="col">Assignments</th>{editable&&<th scope="col">Actions</th>}</tr></thead><tbody>
   {visible.map(name=><tr key={name}>
    {editable&&<td><input type="checkbox" aria-label={'Select '+name} checked={selected.includes(name)}
     onChange={event=>setSelected(current=>event.target.checked?[...current,name]:current.filter(person=>person!==name))}/></td>}
    <th scope="row">{name}{profiles[name].email&&<small>{profiles[name].email}</small>}</th><td>{profiles[name].role}</td>
    <td>{(assignmentsByPerson.get(name)??[]).map(group=><span className={'badge '+levelColors[levelFor(group,name)]} key={group.id}>
     {teamLabel(group)} · {levelFor(group,name)}</span>)}{!assignmentsByPerson.has(name)&&'—'}</td>
    {editable&&<td><button aria-label={'Edit assignments for '+name} aria-expanded={chosen===name} onClick={()=>onChoose(name)}>Edit assignments</button></td>}
   </tr>)}
  </tbody></table></div>
  <Pager count={filtered.length} page={currentPage} setPage={setPage}/>
 </>;
}

function BranchRoster({group,groups,people,editable,leads,searchMatches,onAdd,onLead,onQualification,onRemove}){
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(0);
 const direct=new Set(group.members);
 const isTeam=group.kind==='team';
 const roster=isTeam?teamMembers(groups,group.team):group.members;
 const filtered=roster.filter(name=>searchMatches(name,query)).sort((a,b)=>a.localeCompare(b));
 const currentPage=Math.min(page,Math.max(0,Math.ceil(filtered.length/pageSize)-1));
 return <section className="team-roster">
  <div className="team-assignment-title"><h3>{teamLabel(group)}</h3>{editable&&<button className="primary" onClick={onAdd}>Add members</button>}</div>
  <div className="team-filters">
   {editable?<label>Team lead<select aria-label={teamLabel(group)+' team lead'} value={group.lead||''} onChange={event=>onLead(event.target.value)}>
    <option value="">Unassigned</option>{[...new Set([...leads,group.lead].filter(Boolean))].map(name=><option key={name}>{name}</option>)}
   </select></label>:<p>Team lead · {group.lead||'Unassigned'}</p>}
   <label>Search roster<input type="search" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>
  </div>
  <div className="table-wrap"><table className="team-members-table"><thead><tr><th scope="col">Member</th><th scope="col">Assignment</th>
   <th scope="col">Qualification</th>{editable&&<th scope="col">Actions</th>}</tr></thead><tbody>
   {filtered.slice(currentPage*pageSize,(currentPage+1)*pageSize).map(name=>{
    const subteams=isTeam?groups.filter(item=>item.team===group.team&&item.kind!=='team'&&item.members.includes(name)).map(item=>item.name):[];
    return <tr key={name}><th scope="row">{name}</th><td>{[direct.has(name)?'Direct':null,...subteams].filter(Boolean).join(', ')}</td>
     <td>{direct.has(name)?(editable&&people.includes(name)?<Qualification value={levelFor(group,name)} label={name+' qualification'}
      change={level=>onQualification(name,level)}/>:levelFor(group,name)):'See subteam'}</td>
     {editable&&<td>{direct.has(name)&&<button aria-label={'Remove '+name+' from '+teamLabel(group)} onClick={()=>onRemove(name)}>Remove</button>}</td>}
    </tr>;
   })}
  </tbody></table></div>
  <Pager count={filtered.length} page={currentPage} setPage={setPage}/>
 </section>;
}

function AssignmentEditor({people,groups,searchMatches,options,headingRef,cancel,apply}){
 const [destination,setDestination]=useState(options.destination??'');
 const [query,setQuery]=useState('');
 const [page,setPage]=useState(0);
 const [selected,setSelected]=useState([]);
 const [level,setLevel]=useState('Not set');
 const group=groups.find(group=>group.id===destination);
 const isAdd=options.operation==='add';
 const eligible=group?(options.names??people).filter(name=>isAdd?!group.members.includes(name):group.members.includes(name)):[];
 const chosen=options.names?eligible:selected.filter(name=>eligible.includes(name));
 const matches=eligible.filter(name=>searchMatches(name,query));
 const currentPage=Math.min(page,Math.max(0,Math.ceil(matches.length/pageSize)-1));
 return <form className="team-assignment-panel" onSubmit={event=>{event.preventDefault();if(chosen.length)apply(destination,chosen,level);}}>
  <div className="team-assignment-title"><h3 ref={headingRef} tabIndex={-1}>{isAdd?'Add team assignments':'Set assignment qualifications'}</h3><button type="button" onClick={cancel}>Cancel</button></div>
  <div className="team-filters">
   <label>Assignment destination<select required value={destination} onChange={event=>{setDestination(event.target.value);setSelected([]);setPage(0);}}>
    <option value="">Choose a team or subteam</option>{ordered(groups).map(item=><option value={item.id} key={item.id}>{teamLabel(item)}</option>)}
   </select></label>
   <Qualification value={level} label="Assignment qualification" change={setLevel}/>
   {!options.names&&group&&<label>Find people to add<input type="search" placeholder="Name or email" value={query} onChange={event=>{setQuery(event.target.value);setPage(0);}}/></label>}
  </div>
  {!options.names&&group&&<><div className="team-picker">{matches.slice(currentPage*pageSize,(currentPage+1)*pageSize).map(name=>
   <button key={name} type="button" aria-pressed={selected.includes(name)} onClick={()=>setSelected(current=>current.includes(name)?current.filter(person=>person!==name):[...current,name])}>{name}</button>)}</div>
   <Pager count={matches.length} page={currentPage} setPage={setPage}/></>}
  {group&&options.names&&chosen.length!==options.names.length&&<p className="note">
   {options.names.length-chosen.length} skipped · {isAdd?'already assigned here':'no direct assignment here'}
  </p>}
  <button className="primary" disabled={!chosen.length}>{isAdd?'Add assignments':'Save qualifications'} ({chosen.length})</button>
 </form>;
}

function Qualification({value,label,change}){
 return <label className="team-qualification">{label}<select value={value} onChange={event=>change(event.target.value)}>
  {qualificationLevels.map(level=><option key={level}>{level}</option>)}
 </select></label>;
}

function Pager({count,page,setPage}){
 const start=page*pageSize;
 return <div className="team-pager"><span>{count?start+1+'–'+Math.min(count,start+pageSize)+' of '+count:'No matching members'}</span>
  {count>pageSize&&<><button type="button" disabled={!page} onClick={()=>setPage(page-1)}>Previous</button>
   <button type="button" disabled={start+pageSize>=count} onClick={()=>setPage(page+1)}>Next</button></>}
 </div>;
}

function TeamSetup({roots,groups,save}){
 const [error,setError]=useState('');
 return <section className="panel"><div className="panel-header"><h2>Add a team or subteam</h2></div>
  <form className="org-setup" onSubmit={event=>{
   event.preventDefault();
   const form=event.currentTarget;
   const values=new FormData(form);
   const team=values.get('team').trim(),name=values.get('subteam').trim();
   const root=roots.find(item=>item.team.toLowerCase()===team.toLowerCase());
   if(!team||!name&&root||name&&groups.some(group=>group.kind!=='team'&&group.team.toLowerCase()===team.toLowerCase()&&group.name.toLowerCase()===name.toLowerCase())){
    setError('Enter a new team name or a unique subteam name within the team.');return;
   }
   const newGroup={id:crypto.randomUUID(),team:root?.team??team,name:name||'Direct members',kind:name?'subteam':'team',members:[],lead:''};
   save(current=>normalizeTeamGroups([...current,newGroup]));
   setError('');form.reset();
  }}>
   <label>Team<input name="team" list="org-team-names" required maxLength="36"/></label>
   <datalist id="org-team-names">{roots.map(root=><option key={root.id} value={root.team}/>)}</datalist>
   <label>Subteam (optional)<input name="subteam" maxLength="36"/></label><button className="primary">Add team or subteam</button>
  </form>{error&&<p className="note error" role="alert">{error}</p>}
 </section>;
}
