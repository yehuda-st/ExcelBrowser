import test from "node:test";
import assert from "node:assert/strict";
import {loadCsvStore} from "../docs/src/core/csv-store.js";
import {RECORD_COLUMNS} from "../docs/src/core/data-schema.js";
import {encodeCsvRow} from "../docs/src/transport/csv.js";
const patients="PatientID,AdmissionDate,PatientName,Room\n000012-3,2026-11-01,Test,12\n";
const history=RECORD_COLUMNS.join(",")+"\n"+encodeCsvRow(["r1","000012-3","2026-10-01","2026-10-10",false,"","","","","Test","2026-10-09"]);
test("keeps prior admission history separate from current admission",()=>{
 const s=loadCsvStore(patients,history);
 assert.equal(s.admissions.length,2);
 assert.equal(s.admissions[0].patientId,"000012-3");
 assert.equal(s.admissions[0].active,true);
 assert.equal(s.admissions[1].active,false);
 assert.equal(s.records[0].admissionId,"000012-3|2026-10-01");
});
test("rejects duplicate census keys",()=>assert.throws(()=>loadCsvStore(patients+"000012-3,2026-11-01,Test,12\n",history)));
