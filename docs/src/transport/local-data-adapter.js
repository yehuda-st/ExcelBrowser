import {createHttpClient} from "./http-client.js";
import {recordToCsvRow} from "../core/csv-record-schema.js";
export function createLocalDataAdapter(client=createHttpClient()){
 let store=null;
 return {
 async load(onProgress=()=>{}){onProgress("CSV");store=await client.load();return store;},
 async submit(record,admission){
 if(!store)throw Error("Load data before submitting");
 const previous=store.records.filter(r=>r.admissionId===admission.id).at(-1);
 const row=recordToCsvRow(record,admission);
 const result=await client.request("records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({row,expectedRecordID:previous?.id??null})});
 store=await client.load();
 return {result,store};
 }
 };
}
