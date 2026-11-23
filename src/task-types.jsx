import React, {useState} from 'react';
import {types} from './data';

export const defaultTaskTypes=types.map(id=>({id,label:id}));

export function TaskTypeAdmin({taskTypes,save}){
 const [error,setError]=useState('');
 function submit(event,id){
  event.preventDefault();
  const input=event.currentTarget.elements.label;
  const label=input.value.trim();
  if(!label||taskTypes.some(type=>type.id!==id&&type.label.toLowerCase()===label.toLowerCase())){
   setError('Enter a unique task type name.');return;
  }
  save(id?taskTypes.map(type=>type.id===id?{...type,label}:type):[...taskTypes,{id:crypto.randomUUID(),label}]);
  setError('');
  if(!id)input.value='';
 }
 return <section className="panel" id="task-types"><div className="panel-header"><h2>Task types</h2></div>
  {error&&<p role="alert" className="note error">{error}</p>}
  <div className="catalog-forms">
   {taskTypes.map(type=><form key={type.id+type.label} onSubmit={event=>submit(event,type.id)}>
    <input name="label" aria-label={type.label+' task type name'} defaultValue={type.label} maxLength={40} required/>
    <button>Rename</button>
   </form>)}
   <form onSubmit={event=>submit(event,null)}><input name="label" aria-label="New task type" placeholder="New task type" maxLength={40} required/><button>Add task type</button></form>
  </div>
 </section>;
}
