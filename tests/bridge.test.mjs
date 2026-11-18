import test from "node:test";
import assert from "node:assert/strict";
import {MockVBA} from "../src/bridge/mock-vba.js";
import {BridgeClient} from "../src/bridge/bridge-client.js";
const make=()=>new MockVBA([{path:"/data.xlsx",kind:"DATA",modifiedAt:"2026-11-18T00:00:00Z",rows:[{PatientID:"001",Room:"12",AdmissionStatus:"מאושפז"}]}]);
test("PING and INIT",async()=>{
 const client=new BridgeClient(make());
 assert.deepEqual(await client.send("PING"),{pong:true});
 assert.equal((await client.send("INIT")).files.length,1);
});
test("READ_FILE copies data to staging without modifying file",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 assert.equal((await client.send("READ_FILE",{path:"/data.xlsx",sheet:"Staging_Data"})).rowCount,1);
 assert.equal(mock.getStaging("Staging_Data")[0].Room,"12");
 assert.equal(mock.getFile("/data.xlsx").rows[0].Room,"12");
});
test("WRITE_ROWS updates selected fields and inserts rows",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 mock.setStaging("Changes",[{operation:"UPDATE",rowIndex:0,values:{Room:"14"}},{operation:"INSERT",values:{PatientID:"002",Room:"3"}}]);
 assert.equal((await client.send("WRITE_ROWS",{path:"/data.xlsx",sheet:"Changes",expectedModifiedAt:"2026-11-18T00:00:00Z"})).written,2);
 assert.deepEqual(mock.getFile("/data.xlsx").rows,[{PatientID:"001",Room:"14",AdmissionStatus:"מאושפז"},{PatientID:"002",Room:"3"}]);
});
test("changed file rejects entire batch without partial writes",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 mock.setStaging("Changes",[{operation:"UPDATE",rowIndex:0,values:{Room:"99"}}]);
 await assert.rejects(client.send("WRITE_ROWS",{path:"/data.xlsx",sheet:"Changes",expectedModifiedAt:"old"}),/changed/);
 assert.equal(mock.getFile("/data.xlsx").rows[0].Room,"12");
 assert.equal(mock.queue.at(-1).status,"ERROR");
});
test("missing file and locked file report ERROR",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 await assert.rejects(client.send("READ_FILE",{path:"missing",sheet:"X"}),/not found/);
 mock.files.get("/data.xlsx").locked=true;
 await assert.rejects(client.send("READ_FILE",{path:"/data.xlsx",sheet:"X"}),/locked/);
});
test("retrigger does not execute DONE commands twice",async()=>{
 const mock=make(),client=new BridgeClient(mock);
 mock.setStaging("Changes",[{operation:"INSERT",values:{PatientID:"002"}}]);
 await client.send("WRITE_ROWS",{path:"/data.xlsx",sheet:"Changes",expectedModifiedAt:"2026-11-18T00:00:00Z"});
 await mock.trigger();
 assert.equal(mock.getFile("/data.xlsx").rows.length,2);
});
