import test from "node:test";
import assert from "node:assert/strict";
import {MockVBA} from "../src/bridge/mock-vba.js";
import {createDischargeDataAdapter} from "../docs/discharge-data-adapter.js";
test("UI adapter loads, appends, and reloads without changing existing UI record shape",async()=>{
 const mock=new MockVBA([
  {path:"/patients/census.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:[]},
  {path:"/data.xlsx",modifiedAt:"2026-11-18T00:00:00Z",tables:{
   Admissions:[{PatientID:"000000001",AdmissionDate:"2026-11-01",PatientName:"Patient",Room:"12",AdmissionStatus:"מאושפז"}],
   DischargeRecords:[]}}
 ],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});
 const adapter=createDischargeDataAdapter(mock);
 const store=await adapter.load();
 assert.equal(store.admissions.length,1);
 const admission=store.admissions[0];
 const record={id:"r1",admissionId:admission.id,dischargeDate:"2026-11-25",cancelled:false,noticeAt:"",recipient:"",messenger:"",remarks:"",signer:"Doctor",createdAt:"2026-11-18T09:00:00"};
 const saved=await adapter.submit(record,admission);
 assert.equal(saved.store.records[0].admissionId,admission.id);
 assert.equal((await adapter.load()).records.length,1);
 assert.equal(mock.getFile("/data.xlsx").tables.Admissions.length,1);
 assert.equal(mock.getFile("/data.xlsx").tables.DischargeRecords.length,1);
});
