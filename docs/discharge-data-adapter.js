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
  async load(){
   loaded=await loadDischargeStore(client,transport);
   return loaded.store;
  },
  async submit(record,admission){
   if(!loaded)throw Error("Load data before submitting");
   const result=await appendDischargeRecord(client,transport,loaded,record,admission);
   // Always reload after the write: UI must show persisted rows, not optimistic data.
   loaded=await loadDischargeStore(client,transport);
   return {result,store:loaded.store};
  }
 };
}
