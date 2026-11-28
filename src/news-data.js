export const sampleNews=[
 {id:'sample-a',account:'Account A',title:'Updated formatting handoff checklist',
  body:'Before sending a file to QC, confirm the source version, page count, and delivery format in the request. Record any approved exceptions in the handoff notes.',
  publishedBy:'Demo coordinator',publishedAt:Date.parse('2026-11-24T17:00:00Z')},
 {id:'sample-b',account:'Account B',title:'Accessibility review reminder',
  body:'Check document reading order and heading structure before marking accessibility review complete. Record any issues in the request so the next operator can see them.',
  publishedBy:'Demo coordinator',publishedAt:Date.parse('2026-11-25T17:00:00Z')},
 {id:'sample-c',account:'Account C',title:'Updated intake checklist',
  body:'Before starting work, check that the request includes the source file and the required delivery format. Ask the project owner for any missing details.',
  publishedBy:'Demo coordinator',publishedAt:Date.parse('2026-11-26T17:00:00Z')},
];

export function newsAccounts({profile,profiles,requests,tasks,workflowFiles},accounts){
 if(profiles[profile]?.role==='Manager')return new Set(accounts.map(account=>account.id));
 const archivedFiles=new Set(workflowFiles.filter(file=>file.archivedAt).map(file=>file.id));
 const assignedRequests=new Set(tasks.filter(task=>task.person===profile&&!archivedFiles.has(task.fileId)).map(task=>task.request));
 const relatedAccounts=new Set(requests.filter(request=>request.owner===profile||assignedRequests.has(request.id)).map(request=>request.account));
 const qualifications=new Set(profiles[profile]?.qualifiedAccounts??[]);
 return new Set(accounts.filter(({id})=>qualifications.has(id)||relatedAccounts.has(id)).map(({id})=>id));
}

export function acknowledgeNews(state,accounts,id,timestamp){
 const updates=state.newsUpdates??sampleNews;
 const update=updates.find(item=>item.id===id);
 if(!update||!newsAccounts(state,accounts).has(update.account))return state;
 const receipts=state.newsReceipts??[];
 if(receipts.some(item=>item.updateId===id&&item.user===state.profile))return state;
 return {...state,newsReceipts:[...receipts,{updateId:id,user:state.profile,acknowledgedAt:timestamp}]};
}

export function publishNews(state,accounts,fields,id,timestamp){
 const {account,title,body}=fields;
 const cleanTitle=title.trim(),cleanBody=body.trim();
 if(state.profiles[state.profile]?.role!=='Manager'||!accounts.some(item=>item.id===account)||
    !cleanTitle||!cleanBody||cleanTitle.length>120||cleanBody.length>4000)return state;
 const updates=state.newsUpdates??sampleNews;
 if(updates.some(update=>update.id===id))return state;
 return {...state,newsUpdates:[{id,account,title:cleanTitle,body:cleanBody,
  publishedBy:state.profile,publishedAt:timestamp},...updates]};
}
