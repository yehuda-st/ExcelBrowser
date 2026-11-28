import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseCsv} from "../docs/src/transport/csv.js";
const base="http://127.0.0.1:8765";
const headers={"X-Discharge-Client":"1",Origin:base};
const get=path=>fetch(base+path,{headers});
const post=(row,expectedRecordID)=>fetch(base+"/api/records",{method:"POST",headers:{...headers,"Content-Type":"application/json"},body:JSON.stringify({row,expectedRecordID})});
const row={RecordID:"integration-1",PatientID:"000000001",AdmissionDate:"2026-11-01",DischargeDate:"2026-12-01",Cancelled:false,NoticeAt:"",Recipient:"",Messenger:"",Remarks:'עברית, "quoted"\nsecond line',Signer:"Test",SignedAt:"2026-11-28T12:00:00Z",PatientName:"Test Patient One",Room:"12"};
test("Windows AHK server end to end",async t=>{
 await t.test("startup and health",async()=>{
  let response;
  for(let i=0;i<30;i++){try{response=await get("/api/health");if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
  assert.equal(response?.status,200);
 });
 await t.test("HTML and CSV reads",async()=>{
  assert.match(await (await get("/")).text(),/מעקב/);
  assert.equal(parseCsv(await (await get("/api/patients")).text()).length,2);
  assert.equal(parseCsv(await (await get("/api/records")).text()).length,0);
  assert.equal((await fetch(base+"/api/records")).status,403);
  assert.equal((await get("/server/config.ini")).status,404);
  assert.equal((await get("/api/heartbeat")).status,200);
 });
 await t.test("append, Hebrew and multiline CSV round trip",async()=>{
  const response=await post(row,null);
  assert.equal(response.status,201,await response.text());
  const records=parseCsv(await (await get("/api/records")).text());
  assert.equal(records.length,1);
  assert.equal(records[0].Remarks,row.Remarks);
  assert.equal(records[0].PatientID,row.PatientID);
 });
 await t.test("duplicate and stale record rejected",async()=>{
  assert.equal((await post(row,"integration-1")).status,409);
  assert.equal((await post({...row,RecordID:"stale"},null)).status,409);
 });
 await t.test("concurrent writes preserve history",async()=>{
  const responses=await Promise.all(["a","b"].map(id=>post({...row,RecordID:id},"integration-1")));
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,409]);
  const records=parseCsv(await (await get("/api/records")).text());
  assert.equal(records.length,2);
  assert.equal(records[0].RecordID,row.RecordID);
  assert.deepEqual(parseCsv(await readFile("server/ci-records.csv","utf8")),records);
 });
});
