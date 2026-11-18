import test from "node:test";
import assert from "node:assert/strict";
import {prepareWriteBatch} from "../src/core/write-batch.js";
import {MockVBA} from "../src/bridge/mock-vba.js";
import {BridgeClient} from "../src/bridge/bridge-client.js";
import {prepareCensusSync,applyCensusSync} from "../src/core/workflow.js";
const old={PatientID:"000000001",AdmissionDate:"2026-11-01",PatientName:"A",Room:"1",AdmissionStatus:"מאושפז",RecordID:"signed",Signer:"Doctor"};
const add={operation:"INSERT",values:{PatientID:"000000002",AdmissionDate:"2026-11-02",PatientName:"B",Room:"2",AdmissionStatus:"מאושפז"}};
test("JS rejects writes to signed history, invalid indexes and duplicate admission",async()=>{
 for(const changes of [
  [{operation:"UPDATE",rowIndex:0,values:{Signer:"Other"}}],
  [{operation:"UPDATE",rowIndex:0,values:{RecordID:"changed"}}],
  [{operation:"UPDATE",rowIndex:4,values:{Room:"2"}}],
  [{operation:"UPDATE",rowIndex:0,values:{Room:"2"}},{operation:"UPDATE",rowIndex:0,values:{Room:"3"}}],
  [{operation:"INSERT",values:{...old,RecordID:undefined}}],
  [{operation:"INSERT",values:{...add.values,PatientID:"000000001",AdmissionDate:"2026-11-01"}}]
 ])await assert.rejects(prepareWriteBatch([old],changes));
});
test("JS batch ID is deterministic for identical snapshot and changes",async()=>{
 const a=await prepareWriteBatch([old],[add]);
 const b=await prepareWriteBatch([old],[add]);
 assert.equal(a.batchId,b.batchId);
 assert.equal(a.expectedRows,1);
});
test("atomic executor rejects invalid second operation without partial changes",async()=>{
 const mock=new MockVBA([{path:"/data.xlsx",modifiedAt:"2026-11-01T00:00:00Z",rows:[old]}]);
 mock.setStaging("Changes",[add,{operation:"UPDATE",rowIndex:99,values:{Room:"9"}}]);
 const client=new BridgeClient(mock);
 await assert.rejects(client.send("WRITE_ROWS",{path:"/data.xlsx",sheet:"Changes",expectedModifiedAt:"2026-11-01T00:00:00Z",batchId:"bad"}),/Invalid row index/);
 assert.deepEqual(mock.getFile("/data.xlsx").rows,[old]);
});
test("replay of completed batch is safe even after modified timestamp changes",async()=>{
 const mock=new MockVBA([
  {path:"/patients/latest.xlsx",modifiedAt:"2026-11-18T00:00:00Z",rows:[{PatientID:"1",AdmissionDate:"2026-11-01",PatientName:"A",Room:"2"}]},
  {path:"/data.xlsx",modifiedAt:"2026-11-17T00:00:00Z",rows:[old]}
 ],{PatientsFolder:"/patients",DataFilePath:"/data.xlsx"});
 const client=new BridgeClient(mock);
 const prepared=await prepareCensusSync(client,mock);
 const first=await applyCensusSync(client,prepared);
 const replay=await applyCensusSync(client,prepared);
 assert.equal(first.written,1);
 assert.equal(replay.alreadyApplied,true);
 assert.deepEqual(mock.getFile("/data.xlsx").rows,[{...old,Room:"2"}]);
 assert.equal(Object.keys(mock.getFile("/data.xlsx").appliedBatches).length,1);
});
