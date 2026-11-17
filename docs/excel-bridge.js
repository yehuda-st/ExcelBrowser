"use strict";
window.ExcelDischargeBridge = (() => {
 const TABLE = "DischargeRecords", SHEET = "Bridge";
 const HEADERS = ["PatientID","AdmissionDate","PatientName","Room","AdmissionStatus","RecordID","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt"];
 const excelDate = v => {
  if(v===null||v===undefined||v==="")return "";
  if(typeof v==="number"){const d=new Date(Math.round((v-25569)*86400000));return d.toISOString().slice(0,10)}
  const s=String(v);if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);
  const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);return m?m[3]+"-"+m[2].padStart(2,"0")+"-"+m[1].padStart(2,"0"):"";
 };
 const dateTime=v=>{
  if(v===null||v===undefined||v==="")return "";
  if(typeof v==="number"){const d=new Date(Math.round((v-25569)*86400000));return d.toISOString().slice(0,19)}
  return String(v);
 };
 const id=v=>String(v??"").trim().padStart(9,"0");
 const bool=v=>v===true||v===1||String(v).toLowerCase()==="true"||String(v)==="1";
 async function load(){
  return Excel.run(async context=>{
   const t=context.workbook.tables.getItem(TABLE);
   const headers=t.getHeaderRowRange(), body=t.getDataBodyRangeOrNullObject();
   headers.load("values");body.load(["values","isNullObject"]);await context.sync();
   const names=headers.values[0].map(x=>String(x).trim());
   const missing=HEADERS.filter(x=>!names.includes(x));if(missing.length)throw Error("חסרות עמודות בטבלת "+TABLE+": "+missing.join(", "));
   const admissions=new Map(),records=[];
   for(const values of body.isNullObject?[]:body.values){
    const r=Object.fromEntries(names.map((n,i)=>[n,values[i]]));
    if(!r.PatientID||!r.AdmissionDate)continue;
    const patientId=id(r.PatientID),admissionDate=excelDate(r.AdmissionDate);
    if(!admissionDate)continue;
    const admissionId=patientId+"|"+admissionDate;
    admissions.set(admissionId,{id:admissionId,patientId,name:String(r.PatientName||""),room:String(r.Room||""),admissionDate,active:String(r.AdmissionStatus||"").trim()==="מאושפז"});
    if(r.RecordID){
     records.push({id:String(r.RecordID),admissionId,dischargeDate:excelDate(r.DischargeDate),cancelled:bool(r.Cancelled),noticeAt:dateTime(r.NoticeAt),recipient:String(r.Recipient||""),messenger:String(r.Messenger||""),remarks:String(r.Remarks||""),signer:String(r.Signer||""),createdAt:dateTime(r.SignedAt)});
    }
   }
   return {admissions:[...admissions.values()],records};
  });
 }
 const QUEUE="BridgeQueue";
 const QUEUE_HEADERS=["CommandID","Status","Action","PatientID","AdmissionDate","RecordID","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt","Result"];
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function submit(record,patient){
  const commandId=record.id; // Stable ID: retrying the same record cannot duplicate a command.
  await Excel.run(async context=>{
   const queue=context.workbook.tables.getItem(QUEUE);
   const header=queue.getHeaderRowRange(),body=queue.getDataBodyRangeOrNullObject();
   header.load("values");body.load(["values","isNullObject"]);await context.sync();
   const names=header.values[0].map(String);
   const missing=QUEUE_HEADERS.filter(n=>!names.includes(n));
   if(missing.length)throw Error("חסרות עמודות ב־BridgeQueue: "+missing.join(", "));
   const rows=body.isNullObject?[]:body.values;
   const index=names.indexOf("CommandID");
   if(!rows.some(row=>String(row[index])===commandId)){
    const values={CommandID:commandId,Status:"PENDING",Action:"ADD",PatientID:patient.patientId,
     AdmissionDate:patient.admissionDate,RecordID:record.id,DischargeDate:record.dischargeDate,
     Cancelled:record.cancelled?1:0,NoticeAt:record.noticeAt,Recipient:record.recipient,
     Messenger:record.messenger,Remarks:record.remarks,Signer:record.signer,SignedAt:record.createdAt,Result:""};
    queue.rows.add(null,[names.map(n=>values[n]??"")]);
    await context.sync();
   }
   // Trigger AFTER queue row exists. VBA processes all pending commands.
   const ws=context.workbook.worksheets.getItem(SHEET);
   ws.getRange("Z1").values=[[commandId]];
   await context.sync();
  });
  for(let i=0;i<30;i++){
   await sleep(500);
   const result=await Excel.run(async context=>{
    const queue=context.workbook.tables.getItem(QUEUE);
    const header=queue.getHeaderRowRange(),body=queue.getDataBodyRangeOrNullObject();
    header.load("values");body.load(["values","isNullObject"]);await context.sync();
    const names=header.values[0].map(String),rows=body.isNullObject?[]:body.values;
    const row=rows.find(r=>String(r[names.indexOf("CommandID")])===commandId);
    return row?{status:String(row[names.indexOf("Status")]),message:String(row[names.indexOf("Result")]||"")}:null;
   });
   if(result?.status==="DONE")return result.message;
   if(result?.status==="ERROR")throw Error(result.message||"VBA reported an error; the queued row was retained.");
  }
  throw Error("הפקודה נשארה בתור ללא אישור. בדוק את BridgeQueue לפני ניסיון חוזר.");
 }
 return {load,submit,TABLE,SHEET,HEADERS,QUEUE,QUEUE_HEADERS};
})();