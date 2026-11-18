import {planCensusSync} from "./census-sync.js";
import {prepareWriteBatch} from "./write-batch.js";
export async function prepareCensusSync(client,staging){
 const {files}=await client.send("INIT");
 const patients=files.find(f=>f.kind==="PATIENTS"),data=files.find(f=>f.kind==="DATA");
 if(!patients||!data)throw Error("INIT missing required file metadata");
 await client.send("READ_FILE",{path:patients.path,sheet:"Staging_Patients"});
 const table=data.tables?.includes("Admissions")?"Admissions":undefined;
 await client.send("READ_FILE",{path:data.path,table,sheet:"Staging_Data"});
 const rows=staging.getStaging("Staging_Data");
 const plan=planCensusSync(staging.getStaging("Staging_Patients"),rows);
 const batch=await prepareWriteBatch(rows,plan.changes,{table:table??"Admissions"});
 staging.setStaging("Staging_Changes",plan.changes);
 return {plan,batch,source:data,patients,table};
}
export async function applyCensusSync(client,prepared){
 if(!prepared?.source?.path)throw Error("Missing prepared sync");
 if(!prepared.plan.changes.length)return {written:0};
 return client.send("WRITE_ROWS",{path:prepared.source.path,table:prepared.table,sheet:"Staging_Changes",expectedModifiedAt:prepared.source.modifiedAt,batchId:prepared.batch.batchId,expectedRows:prepared.batch.expectedRows});
}
