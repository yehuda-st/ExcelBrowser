import {rowsToStore,admissionKey,RECORD_COLUMNS} from "./data-schema.js";
import {parseCsv} from "../transport/csv.js";
export function loadCsvStore(patientText,recordText,{completeCensus=true}={}){
 const patients=parseCsv(patientText),records=parseCsv(recordText);
 if(!patients.length)throw Error("Empty patient census");
 const admissions=new Map();
 for(const row of patients){
  if(!row.PatientID||!/^\d{4}-\d{2}-\d{2}$/.test(row.AdmissionDate)||!row.PatientName)throw Error("Invalid census row");
  const key=admissionKey(row);
  if(admissions.has(key))throw Error("Duplicate admission");
  admissions.set(key,{...row,AdmissionStatus:"מאושפז"});
 }
 const ids=new Set();
 for(const row of records){
  if(RECORD_COLUMNS.some(c=>!(c in row))||!row.RecordID||!row.PatientID||!/^\d{4}-\d{2}-\d{2}$/.test(row.AdmissionDate))throw Error("Invalid discharge record");
  if(ids.has(row.RecordID))throw Error("Duplicate record ID");
  ids.add(row.RecordID);
  const key=admissionKey(row);
  if(!admissions.has(key))admissions.set(key,{PatientID:row.PatientID,AdmissionDate:row.AdmissionDate,PatientName:row.PatientName||row.PatientID,Room:row.Room||"",AdmissionStatus:completeCensus?"משוחרר":"לא ידוע"});
  else if(admissions.get(key).AdmissionStatus!=="מאושפז" && row.PatientName)Object.assign(admissions.get(key),{PatientName:row.PatientName,Room:row.Room||""});
 }
 return rowsToStore([...admissions.values()],records);
}
