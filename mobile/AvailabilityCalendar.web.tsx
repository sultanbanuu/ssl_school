import React from "react";
import { addDays, timeString } from "../src/scheduling";
import { civil, fullName, type AvailabilitySlot, type AvailabilityDraft } from "./useAvailability";
export function AvailabilityCalendar({ week, slots, busy, onSelect, onCreate }: {
 week: string; slots: AvailabilitySlot[]; busy: boolean; onSelect: (slot: AvailabilitySlot) => void;
 onCreate?: (date: string, start: number, end: number) => void;
 onMove?: (slot: AvailabilitySlot, draft: AvailabilityDraft) => void;
}) {
 const days = Array.from({length:6}, (_, i) => addDays(week,i));
 const halves = [600,630,...Array.from({length:15},(_,i)=>960+i*30)];
 return <div className="appointment-calendar" tabIndex={0} aria-label="Trial availability calendar"><div className="appointment-grid" style={{gridTemplateColumns:"64px repeat(6,minmax(160px,1fr))",minWidth:1024}}>
 <div className="cal-day-header">GMT+4</div>{days.map(date=><div className="cal-day-header" key={date}>{new Date(date+"T12:00:00Z").toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",timeZone:"UTC"})}</div>)}
 {halves.map(minute=><React.Fragment key={minute}><div style={{padding:12,fontSize:11}}>{timeString(minute)}</div>{days.map(date=><div key={date} style={{borderTop:"1px solid #e4eae5",borderLeft:"1px solid #e4eae5",minHeight:72,padding:5}} onDoubleClick={()=>onCreate?.(date,minute,minute+15)}>{slots.filter(s=>{const t=civil(s.startsAt);const m=Number(t.slice(11,13))*60+Number(t.slice(14,16));return s.active && t.slice(0,10)===date && m>=minute && m<minute+30;}).map(slot=><button className="appointment-slot" style={{width:"100%"}} disabled={busy} key={slot.id} data-slot-id={slot.id} onClick={()=>onSelect(slot)}><strong>{civil(slot.startsAt).slice(11,16)}–{civil(slot.endsAt).slice(11,16)}</strong><span>{slot.reservation ? fullName(slot.reservation.student.profile) : fullName(slot.teacher.profile)}</span><small>{slot.reservation?.status || "15-minute trial"}</small></button>)}</div>)}</React.Fragment>)}
 </div></div>;
}
