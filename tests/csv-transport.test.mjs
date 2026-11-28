import test from "node:test";import assert from "node:assert/strict";import {parseCsv,encodeCsvRow} from "../docs/src/transport/csv.js";
test("preserves IDs, Hebrew, quotes and multiline fields",()=>{const row=["000012-3",'שלום, "עולם"\nעוד'];assert.deepEqual(parseCsv("\uFEFFPatientID,Remarks\r\n"+encodeCsvRow(row)),[{PatientID:row[0],Remarks:row[1]}]);});
test("rejects incomplete records",()=>assert.throws(()=>parseCsv('A,B\n1,"broken')));
