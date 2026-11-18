import {command} from "./command-contract.js";
export class BridgeClient {
 constructor(adapter){this.adapter=adapter;}
 async send(action,params={}){
  const job=this.adapter.enqueue(command(action,params));
  await this.adapter.trigger();
  if(job.status!=="DONE")throw Error(job.error||"Command did not complete");
  return structuredClone(job.result);
 }
}
