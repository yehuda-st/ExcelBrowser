import {BridgeClient} from "./src/bridge/bridge-client.js";
import {loadDischargeStore,appendDischargeRecord} from "./src/core/record-workflow.js";

/**
 * UI data adapter. The transport implements enqueue/trigger and
 * getStaging/setStaging (the same interface as MockVBA).
 * No discharge business rules are duplicated here.
 */
export function createDischargeDataAdapter(transport){
 const client=new BridgeClient(transport);
 let loaded=null;
 return {
  async load(onProgress){
   loaded=await loadDischargeStore(client,transport,onProgress);
   return loaded.store;
  },
  async submit(record,admission){
   if(!loaded)throw Error("Load data before submitting");
   const result=await appendDischargeRecord(client,transport,loaded,record,admission);
   loaded.records.push({RecordID:record.id,PatientID:admission.patientId,AdmissionDate:admission.admissionDate,DischargeDate:record.dischargeDate,Cancelled:record.cancelled,NoticeAt:record.noticeAt,Recipient:record.recipient,Messenger:record.messenger,Remarks:record.remarks,Signer:record.signer,SignedAt:record.createdAt});
   loaded.store.records.push(structuredClone(record));
   loaded.source.modifiedAt=result.modifiedAt;
   return {result,store:loaded.store};
  }
 };
}
