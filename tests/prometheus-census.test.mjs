import test from "node:test";
import assert from "node:assert/strict";
import {parsePrometheusCensus} from "../docs/src/core/prometheus-census.js";
test("Prometheus raw census converts name, ID, bed and days (admission day 1)",()=>{
 const rows=[{PatientID:"מטופל 5EB18D19        97790615-P נ,95",AdmissionDate:13,PatientName:1}];
 assert.deepEqual(parsePrometheusCensus(rows,{modifiedAt:"2026-11-19T08:00:00"}),[
  {PatientName:"מטופל 5EB18D19",PatientID:"097790615",AdmissionDate:"2026-11-07",Room:"1",AdmissionStatus:"מאושפז"}
 ]);
});
test("Reject invalid days rather than corrupt admissions",()=>{
 assert.throws(()=>parsePrometheusCensus([{PatientID:"מטופל 5EB18D19 97790615-P נ,95",AdmissionDate:0,PatientName:1}],{modifiedAt:"2026-11-19T08:00:00"}),/Invalid hospitalization days/);
});
