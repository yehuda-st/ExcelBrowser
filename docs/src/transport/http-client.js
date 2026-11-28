import {loadCsvStore} from "../core/csv-store.js";
export function createHttpClient(fetcher=globalThis.fetch){
 async function request(path,options={}){
  const response=await fetcher("/api/"+path,{...options,cache:"no-store",headers:{"X-Discharge-Client":"1",...options.headers}});
  if(!response.ok)throw Error("Local server: "+response.status);
  return response.text();
 }
 return {request,async load(){const [patients,records]=await Promise.all([request("patients"),request("records")]);return loadCsvStore(patients,records);}};
}
