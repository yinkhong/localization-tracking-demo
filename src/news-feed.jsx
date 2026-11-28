import React,{useState} from 'react';

export function NewsFeed({updates,accounts,receipts,user,date,canPublish,acknowledge,publish,openArchive,landing=false}){
 const [query,setQuery]=useState('');
 const [account,setAccount]=useState('');
 const [showForm,setShowForm]=useState(false);
 const [error,setError]=useState('');
 const mine=new Map(receipts.filter(receipt=>receipt.user===user).map(receipt=>[receipt.updateId,receipt]));
 const accountLabel=id=>accounts.find(item=>item.id===id)?.label??id;
 const pending=updates.filter(update=>!mine.has(update.id));
 const matches=landing?pending.slice(0,3):updates.filter(update=>
  (!account||update.account===account)&&[update.title,update.body,accountLabel(update.account)]
   .some(value=>value.toLowerCase().includes(query.trim().toLowerCase())));
 const submit=event=>{
  event.preventDefault();
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  if(!fields.title.trim()||!fields.body.trim()){
   setError('Enter a title and update.');return;
  }
  publish(fields);
  setError('');setShowForm(false);
 };
 return <section className="panel news-feed" aria-label={landing?'Account updates':'News archive'}>
  <div className="panel-header news-heading">
   <h2>{landing?'Account updates':'Updates archive'}</h2>
   {landing?<button type="button" onClick={openArchive}>View news archive</button>:
    canPublish&&<button type="button" className="primary" onClick={()=>{setShowForm(value=>!value);setError('');}}
     aria-expanded={showForm}>{showForm?'Close editor':'Publish update'}</button>}
  </div>
  {!landing&&showForm&&canPublish&&<form className="news-form" onSubmit={submit}>
   <label>Account<select name="account" required defaultValue="">
    <option value="" disabled>Choose an account</option>
    {accounts.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
   </select></label>
   <label>Title<input name="title" required maxLength={120}/></label>
   <label>Update<textarea name="body" required rows={5} maxLength={4000}/></label>
   {error&&<p role="alert">{error}</p>}
   <button type="submit" className="primary">Publish to account</button>
  </form>}
  {!landing&&<div className="news-filters">
   <input type="search" aria-label="Search updates" placeholder="Search updates" value={query} onChange={event=>setQuery(event.target.value)}/>
   <select aria-label="Filter updates by account" value={account} onChange={event=>setAccount(event.target.value)}>
    <option value="">All accounts</option>
    {accounts.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
   </select>
  </div>}
  {landing&&pending.length>3&&<p className="news-count">{pending.length} updates awaiting acknowledgment</p>}
  {matches.length===0&&<p className="empty">{landing?'You have no updates awaiting acknowledgment.':'No updates match this view.'}</p>}
  {matches.map(update=>{
   const receipt=mine.get(update.id);
   const log=canPublish&&!landing?receipts.filter(item=>item.updateId===update.id):[];
   return <article key={update.id} className="news-item">
    <details>
     <summary>
      <span className="news-title">{update.title}</span>
      <span className="news-meta">{accountLabel(update.account)} · {date(update.publishedAt)}</span>
      {receipt&&<span className="badge green"><i/>Acknowledged</span>}
     </summary>
     <p className="news-body">{update.body}</p>
     <p className="news-meta">Published by {update.publishedBy}</p>
     {receipt?<p className="news-receipt">Acknowledged by {receipt.user} · {date(receipt.acknowledgedAt)}</p>:
      <button type="button" onClick={()=>acknowledge(update.id)} aria-label={'Acknowledge '+update.title}>Acknowledge</button>}
     {canPublish&&!landing&&<details className="news-log">
      <summary>Acknowledgment log ({log.length})</summary>
      {log.length?<ul>{log.map(item=><li key={item.user}>{item.user} · {date(item.acknowledgedAt)}</li>)}</ul>:
       <p className="news-meta">No acknowledgments yet.</p>}
     </details>}
    </details>
   </article>;
  })}
 </section>;
}
