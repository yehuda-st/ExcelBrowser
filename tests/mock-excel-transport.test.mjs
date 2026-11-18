import test from "node:test";
import assert from "node:assert/strict";
import {BridgeClient} from "../src/bridge/bridge-client.js";
import {MockExcelTransport} from "../src/bridge/mock-excel-transport.js";
import {createDischargeDataAdapter} from "../docs/discharge-data-adapter.js";

const make=()=>new MockExcelTransport([
 {path:"/patients/census.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:[]},
 {path:"/data.xlsx",modifiedAt:"2026-11-18T00:00:00Z",tables:{
  Admissions:[{PatientID:"000000001",AdmissionDate:"2026-11-01",PatientName:"Patient",Room:"12",AdmissionStatus:"מאושפז"}],
  DischargeRecords:[]}}
],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});

test("queue is an Excel-like table; VBA does not execute before Calculate",async()=>{
 const transport=make();
 const job=transport.enqueue({id:"cmd-1",action:"PING",params:{}});
 assert.equal(transport.getTable("BridgeQueue")[0].status,"PENDING");
 assert.equal(job.result,null);
 assert.equal(transport.calculateCount,0);
 await transport.trigger();
 assert.equal(transport.calculateCount,1);
 assert.equal(transport.getTable("BridgeQueue")[0].status,"DONE");
 assert.deepEqual(job.result,{pong:true});
 await transport.trigger();
 assert.equal(transport.getTable("BridgeQueue").length,1);
});

test("staging and queue cross the mock workbook boundary on Calculate",async()=>{
 const transport=make();
 transport.setStaging("Staging_Changes",[{operation:"INSERT",values:{RecordID:"r1",PatientID:"000000001",AdmissionDate:"2026-11-01"}}]);
 const job=transport.enqueue({id:"cmd-2",action:"WRITE_ROWS",params:{
  path:"/data.xlsx",table:"DischargeRecords",sheet:"Staging_Changes",
  expectedModifiedAt:"2026-11-18T00:00:00Z",expectedRows:0,batchId:"batch-1"
 }});
 assert.equal(transport.getFile("/data.xlsx").tables.DischargeRecords.length,0);
 assert.equal(job.status,"PENDING");
 await transport.trigger();
 assert.equal(job.status,"DONE");
 assert.equal(transport.getFile("/data.xlsx").tables.DischargeRecords.length,1);
 await transport.trigger();
 assert.equal(transport.getFile("/data.xlsx").tables.DischargeRecords.length,1);
});

test("real UI adapter works through workbook tables and Calculate mock",async()=>{
 const transport=make(),adapter=createDischargeDataAdapter(transport);
 const store=await adapter.load();
 assert.equal(store.admissions.length,1);
 assert.equal(transport.getTable("BridgeQueue").filter(x=>x.action==="READ_FILE").length,2);
 assert.equal(transport.getTable("Staging_Admissions").length,1);
 const admission=store.admissions[0];
 const record={id:"r1",admissionId:admission.id,dischargeDate:"2026-11-25",cancelled:false,noticeAt:"",recipient:"",messenger:"",remarks:"",signer:"Doctor",createdAt:"2026-11-18T09:00:00"};
 const result=await adapter.submit(record,admission);
 assert.equal(result.store.records.length,1);
 assert.equal(transport.getTable("Staging_RecordChanges")[0].operation,"INSERT");
 assert.equal(transport.getFile("/data.xlsx").tables.DischargeRecords.length,1);
 assert.ok(transport.getTable("BridgeQueue").every(x=>x.status==="DONE"));
});

test("VBA failure updates queue ERROR without changing workbook data",async()=>{
 const transport=make(),client=new BridgeClient(transport);
 transport.setStaging("Changes",[{operation:"INSERT",values:{RecordID:"r1"}}]);
 await assert.rejects(client.send("WRITE_ROWS",{path:"/data.xlsx",table:"DischargeRecords",sheet:"Changes",expectedModifiedAt:"wrong",expectedRows:0}),/changed/);
 assert.equal(transport.getTable("BridgeQueue").at(-1).status,"ERROR");
 assert.equal(transport.getFile("/data.xlsx").tables.DischargeRecords.length,0);
});
