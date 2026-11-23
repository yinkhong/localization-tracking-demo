import {zones} from './data.js';

export function zoneCode(zone, value=Date.now()) {
 const date=new Date(value??Date.now());
 const locale=zone==='London'||zone==='India'?'en-GB':'en-US';
 const parts=new Intl.DateTimeFormat(locale,{
  timeZone:zones[zone]??zones.Pacific,timeZoneName:'short',
 }).formatToParts(date);
 const name=parts.find(part=>part.type==='timeZoneName')?.value;
 if(zone==='India')return 'IST';
 if(zone==='London')return name==='GMT+1'?'BST':name;
 return name;
}

export function formatZoned(value, zone, options) {
 if(value==null)return '—';
 const date=new Date(value);
 return new Intl.DateTimeFormat('en-US',{timeZone:zones[zone]??zones.Pacific,...options}).format(date)+' '+zoneCode(zone,date);
}
