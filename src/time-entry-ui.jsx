import React, {useState} from 'react';
import {ZonedInput} from './workflow';

export function CorrectTime({task,running,people,zone,toInstant,localValue,date,save}){
 const [open,setOpen]=useState(false),[selection,setSelection]=useState('new'),[error,setError]=useState('');
 const sessions=task.sessions??[];
 const previous=sessions[Number(selection)];
 const closing=selection==='running';
 const operator=closing?running?.operator:previous?.operator;
 return <div className="time-entry">
  <button onClick={()=>{setOpen(!open);setError('');}} aria-expanded={open}>Correct work time</button>
  {open&&<form onSubmit={event=>{
   event.preventDefault();
   const fields=new FormData(event.currentTarget);
   const parse=(key,original)=>fields.get(key)===localValue(original,zone)&&original!=null?
    original:Date.parse(toInstant(fields.get(key),zone));
   const message=save({selection,operator:fields.get('operator'),start:parse('start',closing?running?.started:previous?.startedAt),end:parse('end',previous?.endedAt),reason:fields.get('reason')});
   if(message){setError(message);return;}
   setOpen(false);setSelection('new');setError('');
  }}>
   <label>Work session<select value={selection} onChange={event=>{setSelection(event.target.value);setError('');}}>
    <option value="new">Add a missed session</option>
    {running&&<option value="running">Close running timer</option>}
    {sessions.map((item,index)=><option key={index} value={index}>{item.operator||task.person} · {date(item.startedAt)}</option>)}
   </select></label>
   <div className="form-grid" key={selection}>
    <label>Operator<select name="operator" defaultValue={operator||task.person||people[0]} disabled={Boolean(operator)}>
     {people.map(name=><option key={name}>{name}</option>)}</select></label>
    <label>Actual start<ZonedInput name="start" {...{zone,toInstant}} initial={localValue(closing?running?.started:previous?.startedAt,zone)} required/></label>
    <label>Actual end<ZonedInput name="end" {...{zone,toInstant}} initial={localValue(previous?.endedAt,zone)} required/></label>
    <label>Reason<input name="reason" required maxLength="240" placeholder="Why is this correction needed?"/></label>
   </div>
   {error&&<p className="error" role="alert">{error}</p>}
   <button className="primary">Save correction</button>
  </form>}
 </div>;
}

export function Breaks({plans,logs,running,zone,toInstant,date,book,start,remove,end,now,clock}){
 const [booking,setBooking]=useState(false),[error,setError]=useState('');
 return <section className="panel break-section">
  <div className="panel-header"><div><h2>Breaks</h2><p>Book a break or start a timer when you step away.</p></div>
   <div className="timeline-controls">
    <button onClick={()=>{setBooking(!booking);setError('');}} aria-expanded={booking}>Book a break</button>
    {running?<button className="primary" onClick={end}>End break · {clock(Math.max(0,Math.floor((now-running.start)/1000)))}</button>:
     <button className="primary" onClick={()=>start()}>Start break</button>}
   </div></div>
  {booking&&<form className="time-entry" onSubmit={event=>{
   event.preventDefault();
   const fields=new FormData(event.currentTarget);
   const message=book(Date.parse(toInstant(fields.get('start'),zone)),Date.parse(toInstant(fields.get('end'),zone)));
   if(message){setError(message);return;}
   setBooking(false);setError('');
  }}><div className="form-grid">
   <label>Planned start<ZonedInput name="start" {...{zone,toInstant}} required/></label>
   <label>Planned end<ZonedInput name="end" {...{zone,toInstant}} required/></label>
  </div>{error&&<p className="error" role="alert">{error}</p>}<button className="primary">Save booking</button></form>}
  {plans.length>0&&<details open><summary>Break bookings ({plans.length})</summary><div className="table-wrap"><table>
   <thead><tr><th>Planned start</th><th>Planned end</th><th>Actions</th></tr></thead>
   <tbody>{[...plans].sort((a,b)=>a.start-b.start).map(item=><tr key={item.id}><td>{date(item.start)}</td><td>{date(item.end)}</td>
    <td>{!item.used&&!running&&<button onClick={()=>start(item.id)}>Start this break</button>} {!item.used&&running?.booking!==item.id&&
     <button onClick={()=>remove(item.id)}>Cancel booking</button>}{item.used&&'Recorded'}</td></tr>)}</tbody>
  </table></div></details>}
  {logs.length>0&&<details><summary>Recorded breaks ({logs.length})</summary><div className="table-wrap"><table>
   <thead><tr><th>Actual start</th><th>Actual end</th><th>Duration</th></tr></thead>
   <tbody>{[...logs].reverse().map(item=><tr key={item.id}><td>{date(item.start)}</td><td>{date(item.end)}</td>
    <td>{clock(Math.floor((item.end-item.start)/1000))}</td></tr>)}</tbody>
  </table></div></details>}
 </section>;
}
