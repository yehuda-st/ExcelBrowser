// Parse the three raw Prometheus fields carried through Staging_Patients.
// No HMO column exists in this source; do not fabricate one.
const str=v=>String(v??"").trim();
export function parsePrometheusName(raw){
 const m=str(raw).replace(/\s+/g," ").match(/^(.*?)\s+(\d{1,9})(?:-(\d|P))?\s+[זנ]\s*,\s*\d{1,3}$/u);
 if(!m||!m[1].trim())throw Error("Unrecognized patient name/ID");
 return {PatientName:m[1].trim(),PatientID:m[2]+(m[3]?"-"+m[3]:"")};
}
export function parsePrometheusCensus(rows,file){
 const stamp=str(file?.modifiedAt);
 const match=stamp.match(/^(\d{4}-\d{2}-\d{2})/);
 if(!match||!Number.isFinite(Date.parse(match[1]+"T00:00:00Z")))throw Error("Invalid patient file modification date");
 const fileDate=new Date(match[1]+"T00:00:00Z");
 if(fileDate.toISOString().slice(0,10)!==match[1])throw Error("Invalid patient file date");
 if(!Array.isArray(rows)||!rows.length)throw Error("Empty patient census");
 return rows.map((r,i)=>{
  try{
   const identity=parsePrometheusName(r.PatientID);
   const days=Number(str(r.AdmissionDate));
   if(!Number.isSafeInteger(days)||days<1||days>36500)throw Error("Invalid hospitalization days");
   const room=str(r.PatientName);
   if(!room)throw Error("Missing bed/room");
   return {...identity,AdmissionDate:new Date(fileDate.getTime()-(days-1)*86400000).toISOString().slice(0,10),Room:room,AdmissionStatus:"מאושפז"};
  }catch(e){throw Error("Patient row "+(i+1)+": "+e.message);}
 });
}
