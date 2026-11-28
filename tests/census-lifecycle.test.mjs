import test from "node:test";
import assert from "node:assert/strict";
import {planCensusSync} from "../docs/src/core/census-sync.js";
import {prepareCensusSync,applyCensusSync} from "../docs/src/core/workflow.js";
import {MockVBA} from "../docs/src/bridge/mock-vba.js";
import {BridgeClient} from "../docs/src/bridge/bridge-client.js";

const admission=(id,date,room,status="מאושפז",extra={})=>({
 PatientID:String(id).padStart(9,"0"),AdmissionDate:date,
 PatientName:"Patient "+id,Room:String(room),AdmissionStatus:status,...extra
});
const censusRow=(id,date,room)=>({
 PatientID:String(id).padStart(9,"0"),AdmissionDate:date,PatientName:"Patient "+id,Room:String(room)
});
const make=(data,patients)=>new MockVBA([
 {path:"/patients/current.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:patients},
 {path:"/data.xlsx",modifiedAt:"2026-11-17T00:00:00Z",rows:data}
],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});

test("readmission with same PatientID but different AdmissionDate creates distinct admission",()=>{
 const prior=admission(1,"2026-10-01","5","שוחרר",{RecordID:"signed-old",Signer:"Doctor"});
 const {changes}=planCensusSync([censusRow(1,"2026-11-18","9")],[prior]);
 assert.equal(changes.length,1);
 assert.equal(changes[0].operation,"INSERT");
 assert.equal(changes[0].values.AdmissionDate,"2026-11-18");
 assert.equal(prior.RecordID,"signed-old");
});

test("room change updates existing admission, never inserts duplicate",()=>{
 const rows=[admission(1,"2026-11-01","5")];
 const {changes}=planCensusSync([censusRow(1,"2026-11-01","8")],rows);
 assert.deepEqual(changes,[{operation:"UPDATE",rowIndex:0,values:{Room:"8"}}]);
});

test("discharge is performed once and repeated sync is a no-op",()=>{
 const rows=[admission(1,"2026-11-01","5"),admission(2,"2026-11-02","6")];
 const list=[censusRow(2,"2026-11-02","6")];
 const first=planCensusSync(list,rows);
 assert.deepEqual(first.changes,[{operation:"UPDATE",rowIndex:0,values:{AdmissionStatus:"שוחרר"}}]);
 rows[0].AdmissionStatus="שוחרר";
 assert.deepEqual(planCensusSync(list,rows).changes,[]);
});

test("same admission reappearing after absence reactivates instead of inserting",()=>{
 const prior=admission(1,"2026-11-01","5","שוחרר",{RecordID:"signed-1",Signer:"Doctor"});
 const {changes}=planCensusSync([censusRow(1,"2026-11-01","7")],[prior]);
 assert.deepEqual(changes,[{operation:"UPDATE",rowIndex:0,values:{Room:"7",AdmissionStatus:"מאושפז"}}]);
});

test("padded and unpadded IDs remain distinct; exact duplicates are rejected",()=>{
 const a={...censusRow(1,"2026-11-01","5"),PatientID:"1"};
 const b={...a,PatientID:"000000001"};
 assert.equal(planCensusSync([a,b],[]).changes.length,2);
 assert.throws(()=>planCensusSync([a,a],[]),/Duplicate census admission/);
});

test("multiple signed records of one admission remain unchanged except admission metadata",()=>{
 const signed=[
  admission(1,"2026-11-01","5","מאושפז",{RecordID:"r1",Signer:"A",SignedAt:"2026-11-01T12:00:00Z",Remarks:"first"}),
  admission(1,"2026-11-01","5","מאושפז",{RecordID:"r2",Signer:"B",SignedAt:"2026-11-02T12:00:00Z",Remarks:"second"})
 ];
 const mock=make(signed,[censusRow(1,"2026-11-01","8")]);
 const client=new BridgeClient(mock);
 return prepareCensusSync(client,mock).then(async prepared=>{
  assert.equal(prepared.plan.changes.length,2);
  assert.equal((await applyCensusSync(client,prepared)).written,2);
  const after=mock.getFile("/data.xlsx").rows;
  for(let i=0;i<2;i++){
   assert.deepEqual({...after[i],Room:"5"},signed[i]);
  }
  const again=await prepareCensusSync(client,mock);
  assert.deepEqual(again.plan.changes,[]);
  assert.equal((await applyCensusSync(client,again)).written,0);
  assert.equal(mock.getFile("/data.xlsx").rows.length,2);
 });
});

test("sequential discharge and new admission persist independently end-to-end",async()=>{
 const previous=admission(1,"2026-10-01","5","מאושפז",{RecordID:"old",Signer:"Doctor"});
 const mock=make([previous],[censusRow(1,"2026-11-18","9")]);
 const client=new BridgeClient(mock);
 const prepared=await prepareCensusSync(client,mock);
 assert.equal(prepared.plan.changes.length,2);
 await applyCensusSync(client,prepared);
 const rows=mock.getFile("/data.xlsx").rows;
 assert.equal(rows.length,2);
 assert.equal(rows[0].AdmissionStatus,"שוחרר");
 assert.equal(rows[0].RecordID,"old");
 assert.equal(rows[1].AdmissionStatus,"מאושפז");
 assert.equal(rows[1].AdmissionDate,"2026-11-18");
 const repeated=await prepareCensusSync(client,mock);
 assert.deepEqual(repeated.plan.changes,[]);
});
