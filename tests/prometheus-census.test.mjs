import test from "node:test";
import assert from "node:assert/strict";
import {parsePrometheusCensus} from "../docs/src/core/prometheus-census.js";
test("Prometheus raw census converts name, ID, bed and days (admission day 1)",()=>{
 const rows=[{PatientID:"מטופל 5EB18D19        97790615-P נ,95",AdmissionDate:13,PatientName:1}];
 assert.deepEqual(parsePrometheusCensus(rows,{modifiedAt:"2026-11-19T08:00:00"}),[
  {PatientName:"מטופל 5EB18D19",PatientID:"97790615-P",AdmissionDate:"2026-11-07",Room:"1",AdmissionStatus:"מאושפז"}
 ]);
});
test("Reject invalid days rather than corrupt admissions",()=>{
 assert.throws(()=>parsePrometheusCensus([{PatientID:"מטופל 5EB18D19 97790615-P נ,95",AdmissionDate:0,PatientName:1}],{modifiedAt:"2026-11-19T08:00:00"}),/Invalid hospitalization days/);
});

test("Prometheus split ID with hyphen check digit and 7-digit prefix",()=>{
 const rows=[{PatientID:"מטופל לדוגמה        2609992-4 נ,84",AdmissionDate:2,PatientName:5}];
 assert.deepEqual(parsePrometheusCensus(rows,{modifiedAt:"2026-11-21T08:00:00"}),[
  {PatientName:"מטופל לדוגמה",PatientID:"2609992-4",AdmissionDate:"2026-11-20",Room:"5",AdmissionStatus:"מאושפז"}
 ]);
});

test("Preserve short hyphenated patient ID exactly",()=>{
 const rows=[{PatientID:"מטופל לדוגמה        905848-8 ז,85",AdmissionDate:1,PatientName:21}];
 assert.deepEqual(parsePrometheusCensus(rows,{modifiedAt:"2026-11-21T08:00:00"}),[
  {PatientName:"מטופל לדוגמה",PatientID:"905848-8",AdmissionDate:"2026-11-21",Room:"21",AdmissionStatus:"מאושפז"}
 ]);
});
