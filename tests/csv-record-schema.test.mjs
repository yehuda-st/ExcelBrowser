import test from "node:test";import assert from "node:assert/strict";
import {CSV_RECORD_COLUMNS,recordToCsvRow} from "../docs/src/core/csv-record-schema.js";
import {loadCsvStore} from "../docs/src/core/csv-store.js";
import {encodeCsvRow} from "../docs/src/transport/csv.js";
test("historical patient retains name and room after leaving census",()=>{
 const a={patientId:"000012-3",admissionDate:"2026-10-01",name:"מטופל לדוגמה",room:"12"};
 const r=recordToCsvRow({id:"r1",dischargeDate:"2026-10-10",cancelled:false},a);
 const store=loadCsvStore("PatientID,AdmissionDate,PatientName,Room\n000099-1,2026-11-01,Other,14",CSV_RECORD_COLUMNS.join(",")+"\n"+encodeCsvRow(CSV_RECORD_COLUMNS.map(k=>r[k])));
 const old=store.admissions.find(x=>!x.active);
 assert.equal(old.name,a.name);assert.equal(old.room,a.room);
});
