import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCensus} from "../docs/src/transport/http-client.js";
import {parseCsv} from "../docs/src/transport/csv.js";
const source='index,שם,חדר/מיטה,ימים\n1,"Patient A 00123456-P נ,95",12,28\n2,"Patient B 000000001 ז,70",14,1\n';
test("native census preserves text IDs and uses file date",()=>{
 const rows=parseCsv(normalizeCensus(source,"2026-11-28"));
 assert.deepEqual(rows.map(r=>r.PatientID),["00123456-P","000000001"]);
 assert.deepEqual(rows.map(r=>r.AdmissionDate),["2026-11-01","2026-11-28"]);
 assert.deepEqual(rows.map(r=>r.Room),["12","14"]);
});
test("native census fails closed without valid file date or headers",()=>{
 assert.throws(()=>normalizeCensus(source,undefined),/modification date/);
 assert.throws(()=>normalizeCensus("a,b\n1,2","2026-11-28"),/headers/);
});
