import {TABLES,admissionKey,rowsToStore,recordToRow} from "./data-schema.js";
import {prepareWriteBatch} from "./write-batch.js";

const RECORD_SHEET="Staging_DischargeRecords",CHANGES_SHEET="Staging_RecordChanges";
const ADMISSION_SHEET="Staging_Admissions";
export async function loadDischargeStore(client,staging,onProgress=()=>{}){
 onProgress("INIT");
 const {files}=await client.send("INIT");
 onProgress("INIT completed; parsing file metadata");
 const data=files.find(f=>f.kind==="DATA");
 if(!data)throw Error("Missing data workbook");
 onProgress("READ_FILE Admissions");
 await client.send("READ_FILE",{path:data.path,table:TABLES.ADMISSIONS,sheet:ADMISSION_SHEET});
 onProgress("READ_FILE DischargeRecords");
 await client.send("READ_FILE",{path:data.path,table:TABLES.RECORDS,sheet:RECORD_SHEET});
 onProgress("Reading staging tables");
 const admissions=staging.getStaging(ADMISSION_SHEET),records=staging.getStaging(RECORD_SHEET);
 const store=rowsToStore(admissions,records);
 return {store,source:data,admissions,records};
}
export async function appendDischargeRecord(client,staging,loaded,record,admission){
 if(!loaded?.source?.path)throw Error("Load records before writing");
 const matching=loaded.admissions.find(r=>admissionKey(r)===admissionKey({PatientID:admission.patientId,AdmissionDate:admission.admissionDate}));
 if(!matching)throw Error("Admission not found");
 if(!record?.id||!record.signer||!record.createdAt)throw Error("Missing signed record fields");
 if(loaded.records.some(r=>String(r.RecordID)===String(record.id)))throw Error("Duplicate RecordID");
 const row=recordToRow(record,admission);
 if(!row.DischargeDate&&!row.Cancelled)throw Error("Discharge date or cancellation required");
 if(Boolean(row.NoticeAt)!==Boolean(row.Recipient))throw Error("Notice timestamp and recipient required together");
 if(row.NoticeAt&&!row.Messenger)throw Error("Missing messenger");
 const changes=[{operation:"INSERT",values:row}];
 const batch=await prepareWriteBatch(loaded.records,changes,{table:TABLES.RECORDS,admissions:loaded.admissions});
 staging.setStaging(CHANGES_SHEET,changes);
 const result=await client.send("WRITE_ROWS",{path:loaded.source.path,table:TABLES.RECORDS,sheet:CHANGES_SHEET,expectedModifiedAt:loaded.source.modifiedAt,expectedRows:batch.expectedRows,batchId:batch.batchId});
 return result;
}
