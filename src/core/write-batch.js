import {createHash} from "node:crypto";
const clone=x=>structuredClone(x);
const protectedFields=new Set(["RecordID","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt"]);
const admissionFields=new Set(["PatientName","Room","AdmissionStatus"]);
const key=r=>String(r.PatientID).trim().padStart(9,"0")+"|"+String(r.AdmissionDate).trim();
const canonical=value=>JSON.stringify(value);
export function prepareWriteBatch(rows,changes){
 if(!Array.isArray(rows)||!Array.isArray(changes))throw Error("Invalid write batch");
 const result=clone(rows),seen=new Set();
 const keys=new Set(rows.map(key));
 for(const change of changes){
  if(!change||!["INSERT","UPDATE"].includes(change.operation)||!change.values||typeof change.values!=="object"||Array.isArray(change.values))throw Error("Invalid row operation");
  if(change.operation==="UPDATE"){
   const i=change.rowIndex;
   if(!Number.isInteger(i)||i<0||i>=rows.length||seen.has(i))throw Error("Invalid or repeated update row index");
   seen.add(i);
   if(Object.keys(change.values).some(field=>!admissionFields.has(field)||protectedFields.has(field)))throw Error("Update may only change admission metadata");
   Object.assign(result[i],clone(change.values));
  }else{
   const r=change.values;
   if(!r.PatientID||!r.AdmissionDate||!r.PatientName||!r.Room||r.AdmissionStatus!=="מאושפז")throw Error("Invalid inserted admission");
   if(Object.keys(r).some(field=>protectedFields.has(field)))throw Error("Insert cannot contain signed history");
   if(keys.has(key(r)))throw Error("Duplicate admission insert");
   keys.add(key(r));result.push(clone(r));
  }
 }
 const digest=createHash("sha256").update(canonical({rows,changes})).digest("hex");
 return {batchId:digest,changes:clone(changes),expectedRows:rows.length};
}
