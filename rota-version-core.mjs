// Pure helpers for North Terrace effective-dated rota versions.
// No Firebase access; safe to test independently before integration.
export const dateUTC = iso => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw Error("Expected YYYY-MM-DD");
  const d = new Date(iso + "T00:00:00Z");
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10)!==iso) throw Error("Invalid date");
  return d;
};
export const isoDate = d => d.toISOString().slice(0,10);
export const mondayOfISO = iso => {
  const d=dateUTC(iso); d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7); return isoDate(d);
};
export const sundayOfISO = iso => {
  const d=dateUTC(iso); d.setUTCDate(d.getUTCDate()+(7-d.getUTCDay())%7); return isoDate(d);
};
export function effectiveVersion(versions, date, fallback=null, dateField="effectiveFrom") {
  dateUTC(date);
  return (Array.isArray(versions)?versions:[])
    .filter(v=>{
      if(!v||typeof v[dateField]!=="string"||v[dateField]>date||!/^\d{4}-\d{2}-\d{2}$/.test(v[dateField])) return false;
      const superseded=typeof v.supersededFrom==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v.supersededFrom)&&v.supersededFrom<=date;
      return !superseded;
    })
    .sort((a,b)=>a[dateField].localeCompare(b[dateField])).at(-1)??fallback;
}
export function rotationEffectiveSunday(v) {
  const date=v.effectiveSunday??v.effectiveFrom;
  const d=dateUTC(date);
  if(d.getUTCDay()===0) return date;
  // Backward compatibility: historical versions used Monday effectiveFrom.
  if(!v.effectiveSunday&&d.getUTCDay()===1) return sundayOfISO(date);
  throw Error("Rotation must start on a Sunday");
}
export function rotationVersion(versions, sunday, fallback=null) {
  if(dateUTC(sunday).getUTCDay()!==0) throw Error("Expected Sunday");
  return (Array.isArray(versions)?versions:[])
    .flatMap(v=>{try{return v?[{v,date:rotationEffectiveSunday(v)}]:[]}catch{return []}})
    .filter(x=>x.date<=sunday).sort((a,b)=>a.date.localeCompare(b.date)).at(-1)?.v??fallback;
}
export function rotationAssignment(config, sunday) {
  if(dateUTC(sunday).getUTCDay()!==0) throw Error("Expected Sunday");
  const order=config?.order;
  if(!Array.isArray(order)||!order.length||order.some(x=>typeof x!=="string"||!x.trim())||new Set(order).size!==order.length) throw Error("Invalid rotation members");
  if(!order.includes(config.startPerson)) throw Error("Invalid start person");
  if(dateUTC(config.anchorSunday).getUTCDay()!==0) throw Error("Invalid anchor Sunday");
  const start=config.shiftStart??"13:30", end=config.shiftEnd??"22:00";
  const minutes=t=>/^([01]\d|2[0-3]):[0-5]\d$/.test(t)?Number(t.slice(0,2))*60+Number(t.slice(3)):NaN;
  if(!Number.isFinite(minutes(start))||!Number.isFinite(minutes(end))||minutes(end)<=minutes(start)||minutes(start)%15||minutes(end)%15) throw Error("Invalid shift hours");
  const weeks=Math.round((dateUTC(sunday)-dateUTC(config.anchorSunday))/604800000);
  const i=order.indexOf(config.startPerson);
  return {owner:order[((i+weeks)%order.length+order.length)%order.length],start,end,sunday};
}
export function rebaseRotationConfig(config, effectiveSunday, activeMembers=null) {
  if(dateUTC(effectiveSunday).getUTCDay()!==0) throw Error("Rotation must start on a Sunday");
  const sourceOrder=config?.order;
  if(!Array.isArray(sourceOrder)||!sourceOrder.length) throw Error("Invalid rotation members");
  const activeSet=Array.isArray(activeMembers)?new Set(activeMembers):null;
  const order=activeSet ? sourceOrder.filter(n=>activeSet.has(n)) : [...sourceOrder];
  if(!order.length) throw Error("No active rotation members remain");
  let sourceOwner;
  try{ sourceOwner=rotationAssignment(config,effectiveSunday).owner; }catch{ sourceOwner=config.startPerson; }
  let startPerson=order.includes(sourceOwner)?sourceOwner:null;
  if(!startPerson){
    const sourceIndex=Math.max(0,sourceOrder.indexOf(sourceOwner));
    for(let step=1;step<=sourceOrder.length;step++){
      const candidate=sourceOrder[(sourceIndex+step)%sourceOrder.length];
      if(order.includes(candidate)){startPerson=candidate;break;}
    }
  }
  startPerson=startPerson||order[0];
  const rebased={
    effectiveSunday,
    effectiveFrom:mondayOfISO(effectiveSunday),
    anchorSunday:effectiveSunday,
    order,
    startPerson,
    shiftStart:config?.shiftStart??"13:30",
    shiftEnd:config?.shiftEnd??"22:00"
  };
  rotationAssignment(rebased,effectiveSunday);
  return rebased;
}
export const isRotationShift = shift => !!shift&&(shift.rotationId==="north-terrace-sunday"||shift.tag==="Sunday rotation");
