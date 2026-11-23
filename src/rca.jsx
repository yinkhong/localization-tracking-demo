import React, {useRef,useState} from 'react';
import {defectAttribution, defectSeverities, defectStatuses} from './defect-review';

export const rcaSections = [
 ['description','Incident summary'],
 ['steps','Steps & operators'],
 ['rootCause','Root cause'],
 ['corrective','Corrective actions'],
 ['preventive','Preventive actions'],
];
const imageData = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/]+=*$/i;
const allowedTags = new Set(['B','STRONG','I','EM','U','BR','P','DIV','UL','OL','LI','H3','H4','BLOCKQUOTE']);
const maxImages = 5;
const maxImageBytes = 500000;

export function cleanRca(markup='') {
 const input=document.createElement('template');
 input.innerHTML=markup;
 const output=document.createElement('div');
 function append(source,target){
  if(source.nodeType===Node.TEXT_NODE){target.append(document.createTextNode(source.textContent));return;}
  if(source.nodeType!==Node.ELEMENT_NODE)return;
  if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','TEMPLATE'].includes(source.tagName))return;
  if(source.tagName==='IMG'){
   const src=source.getAttribute('src');
   if(imageData.test(src??'')){
    const image=document.createElement('img');
    image.src=src;
    image.alt=(source.getAttribute('alt')||'Incident evidence').slice(0,160);
    target.append(image);
   }
   return;
  }
  const element=allowedTags.has(source.tagName)?document.createElement(source.tagName):target;
  if(element!==target)target.append(element);
  for(const child of source.childNodes)append(child,element);
 }
 for(const child of input.content.childNodes)append(child,output);
 return output.innerHTML;
}

function legacyImage(attachment) {
 const bytes=attachment.url?.split(',')[1];
 if(!bytes)return null;
 const type=bytes.startsWith('iVBORw0KGgo')?'png':bytes.startsWith('/9j/')?'jpeg':
  bytes.startsWith('R0lGOD')?'gif':/^UklGR.{5}XRUJQ/.test(bytes)?'webp':null;
 const data=type&&'data:image/'+type+';base64,'+bytes;
 return data&&imageData.test(data)?data:null;
}
function rcaMarkup(record,key) {
 const markup=cleanRca(record?.[key]);
 if(key!=='description')return markup;
 const images=(record?.attachments??[]).flatMap(attachment=>{
  const src=legacyImage(attachment);
  if(!src)return [];
  const image=document.createElement('img');
  image.src=src;image.alt=attachment.name;
  return [image.outerHTML];
 });
 return markup+images.join('');
}

export function RcaBody({record}) {
 return <div className="report-body rca-document">
  {record.filePath&&<p><strong>File path </strong><span>{record.filePath}</span></p>}
  {rcaSections.map(([key,label])=>{
   const markup=rcaMarkup(record,key);
   return <section key={key}><h2>{label}</h2>
    {markup?<div className="rca-content" dangerouslySetInnerHTML={{__html:markup}}/>:<p className="rca-placeholder">—</p>}
   </section>;
  })}
  {record.attachments?.some(item=>!legacyImage(item))&&<section><h2>Previous supporting files</h2><ul>
   {record.attachments.filter(item=>!legacyImage(item)).map((item,index)=><li key={index}>
    <a download={item.name} href={item.url}>{item.name}</a>
   </li>)}</ul></section>}
 </div>;
}

function readImage(file){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result));
  reader.onerror=reject;
  reader.readAsDataURL(file);
 });
}

export function DefectForm({requests,tasks,config,save,cancel,reviewers,canReview}) {
 const initial=config.existing;
 const [request,setRequest]=useState(initial?.request||config.request||requests[0]?.id||'');
 const [task,setTask]=useState(initial?.task||config.task||'');
 const [relatedTasks,setRelatedTasks]=useState(initial?.relatedTasks??[]);
 const [error,setError]=useState('');
 const [pending,setPending]=useState(false);
 const linked=request===initial?.request&&task===initial?.task?initial:defectAttribution(request,task,requests,tasks);
 const reviewerOptions=current=>[...new Set(['',...reviewers,current||''])];
 const editors=useRef({});
 const selections=useRef({});
 const [original]=useState(()=>Object.fromEntries(rcaSections.map(([key])=>[key,rcaMarkup(initial,key)])));
 const refs=useRef(Object.fromEntries(rcaSections.map(([key])=>[key,node=>{
  editors.current[key]=node;
  if(node)node.innerHTML=original[key];
 }])));
 function edit(key,command,value) {
  const editor=editors.current[key];
  const selection=window.getSelection();
  editor.focus();
  selection.removeAllRanges();
  let range=selections.current[key];
  if(!range||!editor.contains(range.commonAncestorContainer)){
   range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
  }
  selection.addRange(range);
  document.execCommand(command,false,value);
  remember(key);
 }
 function remember(key){
  const selection=window.getSelection();
  if(selection.rangeCount&&editors.current[key]?.contains(selection.getRangeAt(0).commonAncestorContainer)){
   selections.current[key]=selection.getRangeAt(0).cloneRange();
  }
 }
 async function insertImages(key,files) {
  if(!files.length||pending)return;
  const count=Object.values(editors.current).reduce((total,node)=>total+(node?.querySelectorAll('img').length??0),0);
  if(count+files.length>maxImages||files.some(file=>!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>maxImageBytes)){
   setError('Use up to five PNG, JPEG, WebP, or GIF images, each 500 KB or smaller.');return;
  }
  remember(key);setPending(true);
  try{
   const images=await Promise.all(files.map(async file=>{
    const src=await readImage(file);
    if(!imageData.test(src))throw new Error('Invalid image');
    const image=document.createElement('img');image.src=src;image.alt=file.name||'Incident evidence';
    return image.outerHTML;
   }));
   if(editors.current[key])edit(key,'insertHTML',images.join('<br>')+'<br>');
   setError('');
  }catch{setError('The image could not be inserted.');}
  finally{setPending(false);}
 }
 return <form className="panel rca-form" onSubmit={event=>{
  event.preventDefault();
  if(pending)return;
  const fields=new FormData(event.currentTarget);
  const content=Object.fromEntries(rcaSections.map(([key])=>[key,cleanRca(editors.current[key].innerHTML)]));
  if(!fields.get('title').trim()||(!editors.current.description.textContent.trim()&&!editors.current.description.querySelector('img'))){
   setError('Enter a title and an incident summary or image.');return;
  }
  save({...content,title:fields.get('title').trim(),filePath:fields.get('filePath').trim(),request,task,relatedTasks:relatedTasks.filter(id=>id!==task),
   severity:fields.get('severity')??initial?.severity??'Major',status:fields.get('status')??initial?.status??'Open',
   assignedTo:fields.get('assignedTo')??initial?.assignedTo??'',reviewedBy:fields.get('reviewedBy')??initial?.reviewedBy??'',attachments:(initial?.attachments??[]).filter(item=>!legacyImage(item))});
 }}>
  <div className="form-grid">
   <label>Incident title<input name="title" defaultValue={initial?.title} required maxLength="120"/></label>
   <label>File path<input name="filePath" defaultValue={initial?.filePath} maxLength="400"/></label>
   <label>Related request<select value={request} required onChange={e=>{setRequest(e.target.value);setTask('');setRelatedTasks([]);}}>
    {requests.map(r=><option key={r.id} value={r.id}>{r.id} · {r.title}</option>)}</select></label>
   <label>Primary related task<select value={task} onChange={e=>{
    setTask(e.target.value);setRelatedTasks(ids=>ids.filter(id=>id!==e.target.value));
   }}><option value="">Request only</option>
    {tasks.filter(t=>t.request===request).map(t=><option key={t.id} value={t.id}>{t.file} · {t.type}</option>)}</select></label>
   <div className="reported-operator"><small>Linked operator</small><strong>{linked?.operator||'—'}</strong></div>
   <div className="reported-operator"><small>Team / account</small><strong>{linked?.team||'—'} / {linked?.account||'—'}</strong></div>
   <label>Assigned to<select name="assignedTo" defaultValue={initial?.assignedTo||''} disabled={!canReview}>
    {reviewerOptions(initial?.assignedTo).map(person=><option key={person} value={person}>{person||'Unassigned'}</option>)}</select></label>
   <label>Reviewed by<select name="reviewedBy" defaultValue={initial?.reviewedBy||''} disabled={!canReview}>
    {reviewerOptions(initial?.reviewedBy).map(person=><option key={person} value={person}>{person||'Not reviewed'}</option>)}</select></label>
   <label>Severity<select name="severity" disabled={Boolean(initial)&&!canReview} defaultValue={initial?.severity||'Major'}>{defectSeverities.map(item=><option key={item}>{item}</option>)}</select></label>
   <label>Status<select name="status" disabled={!canReview} defaultValue={initial?.status||'Open'}>{defectStatuses.map(item=><option key={item}>{item}</option>)}</select></label>
  </div>
  {tasks.some(item=>item.request===request&&item.id!==task)&&<details className="rca-extra-links" open={relatedTasks.length>0}>
   <summary>Additional related tasks ({relatedTasks.length})</summary>
   <div>{tasks.filter(item=>item.request===request&&item.id!==task).map(item=><label key={item.id}>
    <input type="checkbox" checked={relatedTasks.includes(item.id)} onChange={e=>setRelatedTasks(ids=>
     e.target.checked?[...ids,item.id]:ids.filter(id=>id!==item.id))}/>{item.file} · {item.type} · {item.id}
   </label>)}</div>
  </details>}
  {rcaSections.map(([key,label])=><section key={key}><h2>{label}</h2>
   <div className="editor">
    <div className="editor-tools">{[['Bold','bold'],['Italic','italic'],['List','insertUnorderedList']].map(([name,command])=>
     <button type="button" key={command} onMouseDown={e=>e.preventDefault()} onClick={()=>edit(key,command)}>{name}</button>)}
     <label className="insert-image">Insert image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple
      aria-label={'Insert image in '+label} disabled={pending} onChange={e=>{insertImages(key,[...e.target.files]);e.target.value='';}}/></label>
    </div>
    <div className="rca-content" contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true"
     ref={refs.current[key]} onKeyUp={()=>remember(key)} onMouseUp={()=>remember(key)} onBlur={()=>remember(key)}
     onDrop={e=>{e.preventDefault();insertImages(key,[...e.dataTransfer.files]);}}
     onPaste={e=>{e.preventDefault();const files=[...e.clipboardData.files];if(files.length)insertImages(key,files);
      else document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));}}/>
   </div></section>)}
  {error&&<p className="error" role="alert">{error}</p>}
  <div className="actions"><button type="button" onClick={cancel}>Cancel</button><button className="primary" disabled={pending}>Save RCA report</button></div>
 </form>;
}
