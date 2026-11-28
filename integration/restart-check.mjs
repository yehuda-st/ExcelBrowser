import assert from "node:assert/strict";
import {parseCsv} from "../docs/src/transport/csv.js";
let response;
for(let i=0;i<30;i++){try{response=await fetch("http://127.0.0.1:8765/api/records",{headers:{"X-Discharge-Client":"1"}});if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
assert.equal(response?.status,200);
const rows=parseCsv(await response.text());
assert.equal(rows.length,3);
assert.deepEqual(rows.map(r=>r.PatientID),Array(3).fill("000000001"));
assert.deepEqual(rows.map(r=>r.DischargeDate),["2026-12-01","2026-12-03",""]);
console.log("PASS: persisted history after AHK restart");
