import {loadCsvStore} from "../core/csv-store.js";
import {parseCsv,encodeCsvRow} from "./csv.js";
import {parsePrometheusCensus} from "../core/prometheus-census.js";
export function normalizeCensus(text,modifiedAt){
 const rows=parseCsv(text);
 if(!rows.length)throw Error("Empty patient census");
 if(["PatientID","AdmissionDate","PatientName","Room"].every(k=>k in rows[0]))return text;
 const keys=["שם","חדר/מיטה","ימים"];
 if(!keys.every(k=>k in rows[0]))throw Error("Unrecognized Prometheus census headers");
 const parsed=parsePrometheusCensus(rows.map(r=>({PatientID:r["שם"],PatientName:r["חדר/מיטה"],AdmissionDate:r["ימים"]})),{modifiedAt});
 const columns=["PatientID","AdmissionDate","PatientName","Room","AdmissionStatus"];
 return encodeCsvRow(columns)+parsed.map(r=>encodeCsvRow(columns.map(k=>r[k]))).join("");
}
export function createHttpClient(fetcher=globalThis.fetch){
 async function response(path,options={}){
  const result=await fetcher("/api/"+path,{...options,cache:"no-store",headers:{"X-Discharge-Client":"1",...options.headers}});
  if(!result.ok)throw Error("Local server: "+result.status);
  return result;
 }
 async function request(path,options={}){return (await response(path,options)).text();}
 return {request,async load(){
  const [patients,records]=await Promise.all([response("patients"),request("records")]);
  return loadCsvStore(normalizeCensus(await patients.text(),patients.headers?.get("X-Census-Date")),records);
 }};
}
