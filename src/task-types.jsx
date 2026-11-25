import React, {useState} from 'react';
import {types} from './data';

export const defaultTaskTypes=types.map(id=>({id,label:id}));

export function LabelCatalog({items,save,deleteReason,title,id,itemName}){
 const [error,setError]=useState('');
 const [pendingDelete,setPendingDelete]=useState(null);
 function remove(id){
  const reason=deleteReason?.(id);
  if(reason){setError(reason);return;}
  setError('');
  setPendingDelete(id);
 }

 function submit(event,id){
  event.preventDefault();
  const input=event.currentTarget.elements.label;
  const label=input.value.trim();
  if(!label||items.some(type=>type.id!==id&&type.label.toLowerCase()===label.toLowerCase())){
   setError('Enter a unique '+itemName+' name.');return;
  }
  save(id?items.map(type=>type.id===id?{...type,label}:type):[...items,{id:crypto.randomUUID(),label}]);
  setError('');
  if(!id)input.value='';
 }
 return <section className="panel" id={id}><div className="panel-header"><h2>{title}</h2></div>
  {error&&<p role="alert" className="note error">{error}</p>}
  {pendingDelete&&<div className="catalog-delete-confirm" role="group" aria-label="Confirm label deletion">
   <p>Delete <strong>{items.find(item=>item.id===pendingDelete)?.label}</strong>?</p>
   <button type="button" onClick={()=>setPendingDelete(null)}>Cancel</button>
   <button type="button" className="file-danger" onClick={()=>{
    const reason=deleteReason?.(pendingDelete);
    if(reason){setError(reason);setPendingDelete(null);return;}
    save(items.filter(item=>item.id!==pendingDelete));setPendingDelete(null);
   }}>Delete label</button>
  </div>}
  <div className="catalog-forms">
   {items.map(type=><form key={type.id+type.label} onSubmit={event=>submit(event,type.id)}>
    <input name="label" aria-label={type.label+' '+itemName+' name'} defaultValue={type.label} maxLength={40} required/>
    <button>Rename</button>
    <button type="button" className="file-danger" aria-label={'Delete '+type.label} onClick={()=>remove(type.id)}>Delete</button>
   </form>)}
   <form onSubmit={event=>submit(event,null)}><input name="label" aria-label={'New '+itemName} placeholder={'New '+itemName} maxLength={40} required/><button>Add {itemName}</button></form>
  </div>
 </section>;
}

export function TaskTypeAdmin({taskTypes,save,deleteReason}){return <LabelCatalog items={taskTypes} save={save} deleteReason={deleteReason} title="Task types" id="task-types" itemName="task type"/>;}
