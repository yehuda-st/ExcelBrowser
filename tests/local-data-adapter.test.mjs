import test from "node:test";import assert from "node:assert/strict";import {createLocalDataAdapter} from "../docs/src/transport/local-data-adapter.js";
test("submits append request with previous record and patient snapshot",async()=>{
 const a={id:"1-2|2026-11-01",patientId:"1-2",admissionDate:"2026-11-01",name:"Test",room:"12"};
 const store={admissions:[a],records:[{id:"old",admissionId:a.id}]};
 let sent;const adapter=createLocalDataAdapter({load:async()=>store,request:async(p,o)=>{sent=JSON.parse(o.body);return "ok";}});
 await adapter.load();await adapter.submit({id:"new",admissionId:a.id},a);
 assert.equal(sent.expectedRecordID,"old");assert.equal(sent.row.PatientName,"Test");assert.equal(sent.row.PatientID,"1-2");
});
test("failed append is not added locally",async()=>{
 const store={admissions:[],records:[]};const adapter=createLocalDataAdapter({load:async()=>store,request:async()=>{throw Error("Conflict");}});
 await adapter.load();await assert.rejects(adapter.submit({id:"new"},{id:"a"}),/Conflict/);assert.equal(store.records.length,0);
});
