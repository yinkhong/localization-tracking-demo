export const demoRequests = [
 {id:'RQ-1042',title:'Member handbook refresh',account:'Account A',files:12,due:'2026-11-25T01:00:00Z',forecast:'2026-11-25T02:20:00Z',status:'In progress',risk:'At risk',owner:'Alex',initialMinutes:552,types:['Formatting','QC']},
 {id:'RQ-1043',title:'Accessible welcome packet',account:'Account B',files:8,due:'2026-11-26T00:00:00Z',forecast:'2026-11-25T22:30:00Z',status:'In progress',risk:'On track',owner:'Morgan',initialMinutes:304,types:['Preflight','Formatting']},
 {id:'RQ-1044',title:'Provider directory updates',account:'Account A',files:6,due:'2026-11-26T03:00:00Z',forecast:null,status:'Ready',risk:'Unscheduled',owner:'Alex',initialMinutes:192,types:['Formatting']},
 {id:'RQ-1045',title:'Benefits summary',account:'Account B',files:4,due:'2026-11-24T00:00:00Z',forecast:'2026-11-23T22:30:00Z',status:'Complete',risk:'On track',owner:'Jordan',initialMinutes:152,types:['Formatting','QC']},
];
export const demoTasks = [
 {id:'FT-1050',request:'RQ-1042',file:'Member Handbook.docx',type:'Formatting',pages:null,status:'In progress',person:'Alex',spent:1800,due:'2026-11-24T23:00:00Z'},
 {id:'FT-1051',request:'RQ-1042',file:'Member Handbook.docx',type:'QC',pages:null,status:'Waiting',person:'Alex',spent:0,due:'2026-11-25T00:30:00Z',dependsOn:'FT-1050'},
 {id:'FT-1052',request:'RQ-1042',file:'Quick Start Guide.docx',type:'Formatting',pages:40,status:'Ready',person:'',spent:0,due:'2026-11-24T23:00:00Z'},
 {id:'FT-1053',request:'RQ-1043',file:'Welcome Letter.pdf',type:'Preflight',pages:8,status:'Ready',person:'Alex',spent:0,due:'2026-11-25T02:00:00Z'},
 {id:'FT-1054',request:'RQ-1043',file:'Plan Comparison.docx',type:'Formatting',pages:23,status:'Ready',person:'Morgan',spent:0,due:'2026-11-25T19:00:00Z'},
 {id:'FT-1055',request:'RQ-1044',file:'Provider Directory.docx',type:'Formatting',pages:null,status:'Ready',person:'',spent:0,due:'2026-11-26T01:00:00Z'},
 {id:'FT-1056',request:'RQ-1045',file:'Benefits Summary.docx',type:'QC',pages:16,status:'Complete',person:'Alex',spent:1080,due:'2026-11-24T00:00:00Z'},
];
export const demoDefects = [
 {id:'DF-0087',title:'Incorrect footer code',request:'RQ-1042',task:'FT-1050',severity:'Major',status:'Under review',description:'<b>Expected:</b> The approved footer code appears on every page.<br><b>Actual:</b> Page 4 shows the previous version code.',attachments:[]}
];
export const history = {
 'Account A':{Formatting:[32,24,2],QC:[14,19,1],Preflight:[10,12,1]},
 'Account B':{Formatting:[28,15,2],QC:[10,9,1],Preflight:[10,8,1]},
 'Account C':{Formatting:[24,4,2]},
};
export const zones={'Pacific':'America/Los_Angeles','Eastern':'America/New_York','London':'Europe/London','India':'Asia/Kolkata','UTC':'UTC'};
export const types=['Preflight','Formatting','QC'];
export const formatMinutes = n => n == null ? 'Unavailable' : n < 60 ? n+' min' : Math.floor(n/60)+' h'+(n%60?' '+n%60+' min':'');
export function estimate(account,type,pages){
 const rate=history[account]?.[type];
 if(!rate) return {minutes:null,source:'Unavailable'};
 return pages == null ? {minutes:rate[0],samples:rate[1],source:'Historical'} : {minutes:pages*rate[2],source:'Page-based'};
}
export function operatorRanking(account,due,minutes,profiles){
 const dueMs=Date.parse(due);
 const schedules=[
  {name:'Jordan',start:'2026-11-24T21:00:00Z',end:'2026-11-24T22:30:00Z'},
  {name:'Taylor',start:'2026-11-24T21:20:00Z',end:'2026-11-24T22:50:00Z'},
  {name:'Morgan',start:'2026-11-24T18:45:00Z',end:'2026-11-24T21:45:00Z'},
 ];
 return schedules.map(p=>{
  const start=Date.parse(p.start), free=Math.max(0,(Math.min(dueMs,Date.parse(p.end))-start)/60000);
  return {...p,trained:Boolean(profiles[p.name]?.qualifiedAccounts?.includes(account)),free,fits:minutes==null?null:free>=minutes};
 }).sort((a,b)=>Number(b.trained)-Number(a.trained)||b.free-a.free||Date.parse(a.start)-Date.parse(b.start)||a.name.localeCompare(b.name));
}
