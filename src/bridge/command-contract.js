export const ACTIONS=Object.freeze(["PING","INIT","READ_FILE","WRITE_ROWS"]);
export const STATUSES=Object.freeze(["PENDING","RUNNING","DONE","ERROR"]);
export function command(action,params={},id=crypto.randomUUID()){
 if(!ACTIONS.includes(action))throw new Error("Unsupported action: "+action);
 if(!id||typeof id!=="string"||!params||typeof params!=="object"||Array.isArray(params))throw new Error("Invalid command");
 return {id,action,params,status:"PENDING",result:null,error:null};
}
