const str=v=>String(v??"").trim();
const id=v=>str(v);
const date=v=>{
 if(typeof v==="number"&&Number.isFinite(v))return new Date(Math.round((v-25569)*86400000)).toISOString().slice(0,10);
 const s=str(v);return /^\d{4}-\d{2}-\d{2}$/.test(s)?s:"";
};
export function admissionKey(row){
 const patient=id(row.PatientID),admission=date(row.AdmissionDate);
 if(!str(row.PatientID)||!admission)throw Error("Missing PatientID or ISO AdmissionDate");
 return patient+"|"+admission;
}
/**
 * Compare complete current census with persisted admissions.
 * The data file may contain multiple signed records per admission: only the
 * admission metadata is updated, preserving every record and audit field.
 * Missing census patients are always discharged after validation.
 */
export function planCensusSync(census,data){
 if(!Array.isArray(census)||!Array.isArray(data))throw Error("Expected arrays");
 if(census.length===0)throw Error("Empty census: synchronization aborted");
 for(const [index,row] of census.entries()){
  if(!row||typeof row!=="object"||Array.isArray(row))throw Error("Invalid census row "+(index+1));
  for(const field of ["PatientID","AdmissionDate","PatientName","Room"]){
   if(!Object.hasOwn(row,field)||!str(row[field]))throw Error("Missing required census field "+field+" in row "+(index+1));
  }
  if(!/^\d{7,9}(?:-(?:\d|P))?$/.test(str(row.PatientID)))throw Error("Invalid PatientID in row "+(index+1));
  const d=date(row.AdmissionDate);
  if(!d||!Number.isFinite(Date.parse(d))||new Date(d+"T00:00:00Z").toISOString().slice(0,10)!==d)throw Error("Invalid AdmissionDate in row "+(index+1));
 }
 const incoming=new Map(),existing=new Map(),changes=[];
 for(const row of census){
  const key=admissionKey(row);
  if(incoming.has(key))throw Error("Duplicate census admission: "+key);
  incoming.set(key,row);
 }
 data.forEach((row,index)=>{
  if(Object.values(row).every(v=>str(v)===""))return;
  let key;
  try { key=admissionKey(row); }
  catch (error) {
   const rawDate=str(row?.AdmissionDate);
   const rawId=str(row?.PatientID);
   const maskedId=rawId ? "***"+rawId.slice(-4) : "(empty)";
   throw Error(`Invalid Admissions row ${index+1}: PatientID=${maskedId}, AdmissionDate=${JSON.stringify(rawDate||"(empty)")}. Expected a valid Excel date serial or YYYY-MM-DD. ${error.message}`);
  }
  if(!existing.has(key))existing.set(key,[]);
  existing.get(key).push({row,index});
 });
 for(const [key,row] of incoming){
  const matches=existing.get(key);
  const desired={PatientName:str(row.PatientName),Room:str(row.Room),AdmissionStatus:"מאושפז"};
  if(!matches){
   changes.push({operation:"INSERT",values:{PatientID:id(row.PatientID),AdmissionDate:date(row.AdmissionDate),...desired}});
   continue;
  }
  for(const {row:old,index} of matches){
   const values=Object.fromEntries(Object.entries(desired).filter(([k,v])=>str(old[k])!==v));
   if(Object.keys(values).length)changes.push({operation:"UPDATE",rowIndex:index,values});
  }
 }
 for(const [key,matches] of existing){
   if(incoming.has(key))continue;
   for(const {row,index} of matches){
    if(str(row.AdmissionStatus)==="מאושפז")changes.push({operation:"UPDATE",rowIndex:index,values:{AdmissionStatus:"שוחרר"}});
   }
  }
 return {changes,summary:{
  inserted:changes.filter(x=>x.operation==="INSERT").length,
  updated:changes.filter(x=>x.operation==="UPDATE").length,
  unchanged:data.length-changes.filter(x=>x.operation==="UPDATE").length
 }};
}
