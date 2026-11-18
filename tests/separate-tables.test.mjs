import test from "node:test";
import assert from "node:assert/strict";
import {MockVBA} from "../docs/src/bridge/mock-vba.js";
import {BridgeClient} from "../docs/src/bridge/bridge-client.js";
import {prepareCensusSync,applyCensusSync} from "../docs/src/core/workflow.js";
import {loadDischargeStore,appendDischargeRecord} from "../docs/src/core/record-workflow.js";
const admission={PatientID:"000000001",AdmissionDate:"2026-11-01",PatientName:"A",Room:"1",AdmissionStatus:"מאושפז"};
const record={id:"r1",admissionId:"000000001|2026-11-01",dischargeDate:"2026-11-25",cancelled:false,noticeAt:"2026-11-18T12:00",recipient:"Daughter",messenger:"Nurse",remarks:"Updated",signer:"Doctor",createdAt:"2026-11-18T12:05"};
const make=()=>new MockVBA([
 {path:"/patients/latest.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:[{PatientID:"1",AdmissionDate:"2026-11-01",PatientName:"A",Room:"3"}]},
 {path:"/data.xlsx",modifiedAt:"2026-11-17T00:00:00Z",tables:{Admissions:[admission],DischargeRecords:[]}}
],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});
test("census changes Admissions without touching clinical table",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 const plan=await prepareCensusSync(client,mock);
 await applyCensusSync(client,plan);
 assert.equal(mock.getFile("/data.xlsx").tables.Admissions[0].Room,"3");
 assert.deepEqual(mock.getFile("/data.xlsx").tables.DischargeRecords,[]);
});
test("append record, reload UI store, and reject duplicate RecordID",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 const loaded=await loadDischargeStore(client,mock);
 assert.equal(loaded.store.admissions.length,1);
 assert.equal(loaded.store.records.length,0);
 assert.equal((await appendDischargeRecord(client,mock,loaded,record,loaded.store.admissions[0])).written,1);
 const after=await loadDischargeStore(client,mock);
 assert.equal(after.store.records[0].id,"r1");
 assert.equal(after.store.records[0].recipient,"Daughter");
 assert.equal(mock.getFile("/data.xlsx").tables.Admissions.length,1);
 await assert.rejects(appendDischargeRecord(client,mock,after,record,after.store.admissions[0]),/Duplicate RecordID/);
});
test("clinical table remains immutable through subsequent census updates",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 const loaded=await loadDischargeStore(client,mock);
 await appendDischargeRecord(client,mock,loaded,record,loaded.store.admissions[0]);
 const before=structuredClone(mock.getFile("/data.xlsx").tables.DischargeRecords);
 const prepared=await prepareCensusSync(client,mock);
 await applyCensusSync(client,prepared);
 assert.deepEqual(mock.getFile("/data.xlsx").tables.DischargeRecords,before);
 assert.equal(mock.getFile("/data.xlsx").tables.Admissions[0].Room,"3");
});
test("missing admission cannot receive a record",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 const loaded=await loadDischargeStore(client,mock);
 await assert.rejects(appendDischargeRecord(client,mock,loaded,record,{patientId:"2",admissionDate:"2026-11-01"}),/Admission not found/);
});
