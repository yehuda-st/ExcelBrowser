const clone=x=>structuredClone(x);
const protectedFields=new Set(["RecordID","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt"]);
const admissionFields=new Set(["PatientName","Room","AdmissionStatus"]);
const key=r=>String(r.PatientID).trim().padStart(9,"0")+"|"+String(r.AdmissionDate).trim();
const canonical=value=>JSON.stringify(value);
export async function prepareWriteBatch(rows,changes,options={}){
 if(!Array.isArray(rows)||!Array.isArray(changes))throw Error("Invalid write batch");
 const result=clone(rows),seen=new Set();
 const keys=new Set(rows.map(key));
 const recordsMode=options.table==="DischargeRecords";
 const recordIds=new Set(rows.map(r=>String(r.RecordID??"")).filter(Boolean));
 const admissions=new Set((options.admissions??[]).map(key));
 for(const change of changes){
  if(!change||!["INSERT","UPDATE"].includes(change.operation)||!change.values||typeof change.values!=="object"||Array.isArray(change.values))throw Error("Invalid row operation");
  if(change.operation==="UPDATE"){
   const i=change.rowIndex;
   if(!Number.isInteger(i)||i<0||i>=rows.length||seen.has(i))throw Error("Invalid or repeated update row index");
   seen.add(i);
   if(recordsMode)throw Error("Signed records are append-only");
   if(Object.keys(change.values).some(field=>!admissionFields.has(field)||protectedFields.has(field)))throw Error("Update may only change admission metadata");
   Object.assign(result[i],clone(change.values));
  }else{
   const r=change.values;
   if(recordsMode){
    if(!r.RecordID||!r.PatientID||!r.AdmissionDate||!r.Signer||!r.SignedAt)throw Error("Invalid signed record");
    if(recordIds.has(String(r.RecordID)))throw Error("Duplicate RecordID");
    if(!admissions.has(key(r)))throw Error("Record references missing admission");
    recordIds.add(String(r.RecordID));result.push(clone(r));continue;
   }
   if(!r.PatientID||!r.AdmissionDate||!r.PatientName||!r.Room||r.AdmissionStatus!=="מאושפז")throw Error("Invalid inserted admission");
   if(Object.keys(r).some(field=>protectedFields.has(field)))throw Error("Insert cannot contain signed history");
   if(keys.has(key(r)))throw Error("Duplicate admission insert");
   keys.add(key(r));result.push(clone(r));
  }
 }
 const bytes=new TextEncoder().encode(canonical({rows,changes,table:options.table??"Admissions"}));
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),b=>b.toString(16).padStart(2,"0")).join("");
 return {batchId:digest,changes:clone(changes),expectedRows:rows.length};
}
