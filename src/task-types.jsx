import React, {useState} from 'react';
import {types} from './data';

export const defaultTaskTypes=types.map(id=>({id,label:id}));

export function LabelCatalog({items,save,title,id,itemName}){
 const [error,setError]=useState('');
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
  <div className="catalog-forms">
   {items.map(type=><form key={type.id+type.label} onSubmit={event=>submit(event,type.id)}>
    <input name="label" aria-label={type.label+' '+itemName+' name'} defaultValue={type.label} maxLength={40} required/>
    <button>Rename</button>
   </form>)}
   <form onSubmit={event=>submit(event,null)}><input name="label" aria-label={'New '+itemName} placeholder={'New '+itemName} maxLength={40} required/><button>Add {itemName}</button></form>
  </div>
 </section>;
}

export function TaskTypeAdmin({taskTypes,save}){return <LabelCatalog items={taskTypes} save={save} title="Task types" id="task-types" itemName="task type"/>;}
