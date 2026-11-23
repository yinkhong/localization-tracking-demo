import React, {useState} from 'react';
import {groups} from './timeline';

export const defaultTeamGroups=groups.map(({team,name,members})=>({id:team+'/'+name,team,name,members,lead:''}));

export function TeamOrg({groups,profiles,save,editable}){
 const leads=Object.keys(profiles).filter(name=>['Team lead','PM','Manager'].includes(profiles[name].role));
 const people=Object.keys(profiles);
 const [error,setError]=useState('');
 const teams=[...new Set(groups.map(group=>group.team))];
 const update=(id,fields)=>save(groups.map(group=>group.id===id?{...group,...fields}:group));
 return <div className="team-org">
  {editable&&<section className="panel"><div className="panel-header"><h2>Add a team or subteam</h2></div>
   <form className="org-setup" onSubmit={event=>{
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const team=fields.get('team').trim(),name=fields.get('subteam').trim();
    if(!team||!name||groups.some(group=>group.team.toLowerCase()===team.toLowerCase()&&group.name.toLowerCase()===name.toLowerCase())){
     setError('Enter a team name and a unique subteam name.');return;
    }
    save([...groups,{id:crypto.randomUUID(),team:teams.find(item=>item.toLowerCase()===team.toLowerCase())??team,name,lead:'',members:[]}]);
    setError('');event.currentTarget.reset();
   }}>
    <label>Team<input name="team" list="org-team-names" required maxLength="36"/></label>
    <datalist id="org-team-names">{teams.map(team=><option key={team} value={team}/>)}</datalist>
    <label>Subteam<input name="subteam" required maxLength="36"/></label><button className="primary">Add subteam</button>
   </form>{error&&<p className="note error" role="alert">{error}</p>}</section>}
  {teams.map(team=><section className="panel" key={team}>
   <div className="panel-header"><h2>{team}</h2></div>
   <div className="org-branches">{groups.filter(group=>group.team===team).map(group=>
    <section className="org-branch" key={group.id}><h3>{group.name}</h3>
     {editable?<label>Team lead<select aria-label={team+' / '+group.name+' team lead'} value={group.lead||''} onChange={event=>update(group.id,{lead:event.target.value})}>
      <option value="">Unassigned</option>{[...new Set([...leads,group.lead].filter(Boolean))].map(name=><option key={name}>{name}</option>)}</select></label>:
      <p>Team lead · {group.lead||'Unassigned'}</p>}
     <h4>Operators</h4>
     {editable?<div className="org-members">{people.map(name=><label key={name}>
      <input type="checkbox" checked={group.members.includes(name)} onChange={event=>update(group.id,{members:
       event.target.checked?[...group.members,name]:group.members.filter(person=>person!==name)})}/>{name}
     </label>)}</div>:<p>{group.members.join(', ')||'No operators assigned'}</p>}
    </section>)}</div>
  </section>)}
 </div>;
}
