export const qualificationLevels=['Not set','In training','Independent','Trainer'];

export const teamLabel=group=>group.kind==='team'?group.team:group.team+' / '+group.name;

export function teamMembers(groups,team){
 return [...new Set(groups.filter(group=>group.team===team).flatMap(group=>group.members))];
}

export function normalizeTeamGroups(groups){
 const teams=[...new Set(groups.map(group=>group.team))];
 return [
  ...groups,
  ...teams.filter(team=>!groups.some(group=>group.team===team&&group.kind==='team'))
   .map(team=>({id:'team:'+team,kind:'team',team,name:'Direct members',members:[],lead:''})),
 ];
}

export function updateMemberships(groups,groupId,people,level,operation){
 const selected=new Set(people);
 return groups.map(group=>{
  if(group.id!==groupId)return group;
  const current=new Set(group.members);
  const affected=[...selected].filter(person=>operation==='add'?!current.has(person):current.has(person));
  if(!affected.length)return group;
  const qualifications={...group.qualifications};
  for(const name of affected){
   if(operation==='remove'){current.delete(name);delete qualifications[name];}
   else{current.add(name);qualifications[name]=level;}
  }
  return {...group,members:[...current],qualifications};
 });
}
