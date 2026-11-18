import test from "node:test";
import assert from "node:assert/strict";
import {ExcelTransport} from "../src/bridge/excel-transport.js";

test("Office transport exposes same staging and command boundary as mock",()=>{
 const t=new ExcelTransport();
 const changes=[{operation:"INSERT",values:{RecordID:"test"}}];
 t.setStaging("Staging_RecordChanges",changes);
 changes[0].values.RecordID="changed";
 assert.equal(t.getStaging("Staging_RecordChanges")[0].values.RecordID,"test");
 const job=t.enqueue({id:"test-1",action:"PING",params:{}});
 assert.equal(job.status,"PENDING");
 assert.throws(()=>t.enqueue({id:"test-2",action:"PING",params:{}}),/outstanding/);
});
