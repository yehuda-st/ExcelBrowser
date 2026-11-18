# Shared data workbook — normalized schema

The shared workbook `DischargeData.xlsx` contains **two independent Excel Tables**:

## Admissions
Columns: `PatientID | AdmissionDate | PatientName | Room | AdmissionStatus`

Unique key: normalized 9-digit `PatientID` + ISO `AdmissionDate`. One row per admission. Every new complete census synchronizes **only** this table. An absent admission is marked `שוחרר`, never deleted.

## DischargeRecords
Columns: `RecordID | PatientID | AdmissionDate | DischargeDate | Cancelled | NoticeAt | Recipient | Messenger | Remarks | Signer | SignedAt`

Unique key: `RecordID`. The patient/admission columns reference an existing row in `Admissions`. Records are append-only: no changes to signed rows.

## Extensibility
Additional clinical tables can use the same `PatientID + AdmissionDate` foreign key. They never replicate patient demographics or require independent census synchronization. The generic bridge targets a named table using `{path,table,sheet}` on READ_FILE/WRITE_ROWS; JS decides what rows to insert/update.

## Integration status
- `src/core/workflow.js` synchronizes `Admissions`.
- `src/core/record-workflow.js` loads both tables and appends signed records to `DischargeRecords`.
- `src/core/data-schema.js` converts table rows into the existing `store.admissions` and `store.records` shape used by `docs/index.html`.
- `MockVBA` supports named tables. Existing flat-row tests remain supported as a compatibility fixture.
- **Not yet connected:** the production `docs/index.html` still uses the older Office.js prototype adapter, and real VBA has not yet implemented the new named-table bridge. Do not deploy the new format against the old VBA processor.
- **Migration required:** existing combined `DischargeRecords` rows must be split into unique `Admissions` rows and immutable `DischargeRecords` rows, with duplicate `RecordID` and orphan checks. Make a backup first. No automatic migration has been run.
- No real patient data should be committed.
