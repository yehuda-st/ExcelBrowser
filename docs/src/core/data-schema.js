export const TABLES=Object.freeze({ADMISSIONS:"Admissions",RECORDS:"DischargeRecords"});
export const ADMISSION_COLUMNS=Object.freeze(["PatientID","AdmissionDate","PatientName","Room","AdmissionStatus"]);
export const RECORD_COLUMNS=Object.freeze(["RecordID","PatientID","AdmissionDate","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt"]);
export const admissionKey=row=>String(row.PatientID??"").trim()+"|"+String(row.AdmissionDate??"").trim();
export function rowsToStore(admissions,records){
 const map=new Map(admissions.map(row=>{
  const id=admissionKey(row);
  return [id,{id,patientId:String(row.PatientID).trim(),admissionDate:String(row.AdmissionDate),name:String(row.PatientName??""),room:String(row.Room??""),active:row.AdmissionStatus==="מאושפז"}];
 }));
 const result=records.map(row=>{
  const id=admissionKey(row);
  if(!map.has(id))throw Error("Orphan discharge record: "+row.RecordID);
  return {id:String(row.RecordID),admissionId:id,dischargeDate:String(row.DischargeDate??""),cancelled:row.Cancelled===true||row.Cancelled===1||String(row.Cancelled)==="1"||String(row.Cancelled).toLowerCase()==="true",noticeAt:String(row.NoticeAt??""),recipient:String(row.Recipient??""),messenger:String(row.Messenger??""),remarks:String(row.Remarks??""),signer:String(row.Signer??""),createdAt:String(row.SignedAt??"")};
 });
 return {admissions:[...map.values()],records:result};
}
export function recordToRow(record,admission){
 return {RecordID:record.id,PatientID:admission.patientId,AdmissionDate:admission.admissionDate,DischargeDate:record.dischargeDate,Cancelled:record.cancelled,NoticeAt:record.noticeAt,Recipient:record.recipient,Messenger:record.messenger,Remarks:record.remarks,Signer:record.signer,SignedAt:record.createdAt};
}
