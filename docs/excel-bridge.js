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
 const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function submit(record,patient){
  const commandId="cmd-"+Date.now()+"-"+Math.random().toString(36).slice(2);
  const payload=JSON.stringify({commandId,action:"ADD",patientId:patient.patientId,admissionDate:patient.admissionDate,record});
  // A1 is the LAST write, so Worksheet_Calculate never sees an incomplete payload.
  await Excel.run(async context=>{
   const ws=context.workbook.worksheets.getItem(SHEET);
   const command=ws.getRange("A1"),data=ws.getRange("A2"),status=ws.getRange("A4"),message=ws.getRange("A5");
   data.values=[[payload]];status.values=[["PENDING"]];message.values=[[""]];
   await context.sync();command.values=[[commandId]];await context.sync();
  });
  for(let i=0;i<30;i++){
   await sleep(500);
   const result=await Excel.run(async context=>{
    const ws=context.workbook.worksheets.getItem(SHEET);
    const range=ws.getRange("A4:A6");range.load("values");await context.sync();return range.values.map(r=>String(r[0]??""));
   });
   if(result[2]!==commandId)continue;
   if(result[0]==="SUCCESS")return result[1];
   if(result[0]==="ERROR")throw Error(result[1]||"פעולת VBA נכשלה");
  }
  throw Error("לא התקבל אישור מ־VBA. אין לשלוח שוב לפני בדיקה אם הרשומה נשמרה.");
 }
 return {load,submit,TABLE,SHEET,HEADERS};
})();