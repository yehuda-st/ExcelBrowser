import {planCensusSync} from "./census-sync.js";
export async function prepareCensusSync(client,staging,{completeCensus=false}={}){
 const {files}=await client.send("INIT");
 const patients=files.find(f=>f.kind==="PATIENTS"),data=files.find(f=>f.kind==="DATA");
 if(!patients||!data)throw Error("INIT missing required file metadata");
 await client.send("READ_FILE",{path:patients.path,sheet:"Staging_Patients"});
 await client.send("READ_FILE",{path:data.path,sheet:"Staging_Data"});
 const plan=planCensusSync(staging.getStaging("Staging_Patients"),staging.getStaging("Staging_Data"),{completeCensus});
 staging.setStaging("Staging_Changes",plan.changes);
 return {plan,source:data,patients};
}
export async function applyCensusSync(client,prepared){
 if(!prepared?.source?.path)throw Error("Missing prepared sync");
 if(!prepared.plan.changes.length)return {written:0};
 return client.send("WRITE_ROWS",{path:prepared.source.path,sheet:"Staging_Changes",expectedModifiedAt:prepared.source.modifiedAt});
}
