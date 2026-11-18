import test from "node:test";
import assert from "node:assert/strict";
import {planCensusSync} from "../src/core/census-sync.js";
import {prepareCensusSync,applyCensusSync} from "../src/core/workflow.js";
import {MockVBA} from "../src/bridge/mock-vba.js";
import {BridgeClient} from "../src/bridge/bridge-client.js";
const old=[
 {PatientID:"000000001",AdmissionDate:"2026-11-01",PatientName:"A",Room:"1",AdmissionStatus:"מאושפז",RecordID:"signed-1",Signer:"Doctor"},
 {PatientID:"000000001",AdmissionDate:"2026-11-01",PatientName:"A",Room:"1",AdmissionStatus:"מאושפז",RecordID:"signed-2",Signer:"Doctor"},
 {PatientID:"000000002",AdmissionDate:"2026-11-02",PatientName:"B",Room:"2",AdmissionStatus:"מאושפז"}
];
const census=[
 {PatientID:"1",AdmissionDate:"2026-11-01",PatientName:"A",Room:"4"},
 {PatientID:"3",AdmissionDate:"2026-11-03",PatientName:"C",Room:"3"}
];
test("plan updates all admission rows while preserving signed fields",()=>{
 const {changes}=planCensusSync(census,old);
 assert.equal(changes.filter(c=>c.operation==="INSERT").length,1);
 assert.equal(changes.filter(c=>c.operation==="UPDATE").length,3);
 assert.deepEqual(changes.filter(c=>c.rowIndex===0)[0].values,{Room:"4"});
 assert.deepEqual(changes.filter(c=>c.rowIndex===2)[0].values,{AdmissionStatus:"שוחרר"});
 assert.ok(changes.every(c=>c.operation!=="UPDATE"||!Object.keys(c.values).includes("Signer")));
});
test("missing patients are always discharged",()=>{
 const {changes}=planCensusSync(census,old);
 assert.deepEqual(changes.find(c=>c.rowIndex===2).values,{AdmissionStatus:"שוחרר"});
});
test("duplicate admission and invalid date fail closed",()=>{
 assert.throws(()=>planCensusSync([...census,census[0]],old),/Duplicate/);
 assert.throws(()=>planCensusSync([{PatientID:"1",AdmissionDate:"bad",PatientName:"A",Room:"1"}],old),/Invalid AdmissionDate/);
});
test("full workflow stages, previews, writes and preserves history",async()=>{
 const mock=new MockVBA([
  {path:"/patients/new.xlsx",kind:"PATIENTS",modifiedAt:"2026-11-18T00:00:00Z",rows:census},
  {path:"/data.xlsx",kind:"DATA",modifiedAt:"2026-11-17T00:00:00Z",rows:old}
 ],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});
 const client=new BridgeClient(mock);
 const prepared=await prepareCensusSync(client,mock);
 assert.equal(prepared.plan.changes.length,4);
 assert.deepEqual(mock.getFile("/data.xlsx").rows,old);
 assert.equal((await applyCensusSync(client,prepared)).written,4);
 const result=mock.getFile("/data.xlsx").rows;
 assert.equal(result[0].Room,"4");
 assert.equal(result[0].RecordID,"signed-1");
 assert.equal(result[1].RecordID,"signed-2");
 assert.equal(result[2].AdmissionStatus,"שוחרר");
 assert.equal(result[3].PatientID,"000000003");
});
test("workflow detects data file changes before write",async()=>{
 const mock=new MockVBA([
  {path:"/patients/new.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:census},
  {path:"/data.xlsx",modifiedAt:"2026-11-17T00:00:00Z",rows:old}
 ],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});
 const client=new BridgeClient(mock);
 const prepared=await prepareCensusSync(client,mock);
 mock.files.get("/data.xlsx").modifiedAt="2026-11-18T01:00:00Z";
 await assert.rejects(applyCensusSync(client,prepared),/changed/);
 assert.deepEqual(mock.getFile("/data.xlsx").rows,old);
});

test("empty and malformed census fail closed",()=>{
 assert.throws(()=>planCensusSync([],old),/Empty census/);
 for(const field of ["PatientID","AdmissionDate","PatientName","Room"]){
  const invalid={...census[0]};delete invalid[field];
  assert.throws(()=>planCensusSync([invalid],old),/Missing required census field/);
 }
 assert.throws(()=>planCensusSync([{...census[0],PatientID:"abc"}],old),/Invalid PatientID/);
 assert.throws(()=>planCensusSync([{...census[0],AdmissionDate:"2026-02-30"}],old),/Invalid AdmissionDate/);
});
test("empty census cannot trigger a write",async()=>{
 const mock=new MockVBA([
  {path:"/patients/empty.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:[]},
  {path:"/data.xlsx",modifiedAt:"2026-11-17T00:00:00Z",rows:old}
 ],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});
 await assert.rejects(prepareCensusSync(new BridgeClient(mock),mock),/Empty census/);
 assert.deepEqual(mock.getFile("/data.xlsx").rows,old);
 assert.equal(mock.queue.some(j=>j.action==="WRITE_ROWS"),false);
});
