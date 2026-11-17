# Excel ↔ Office.js: append-only command queue prototype

The interface reads `DischargeRecords` and writes new commands to an Excel Table named `BridgeQueue`. Every command gets its **own row**, which is not overwritten by the next command. The VBA processor scans pending rows and appends records to `DischargeRecords` in **the same workbook** (shared-file integration is not implemented yet).

## Workbook setup

1. Create a macro-enabled workbook (`.xlsm`) with worksheets `Data` and `Bridge`.
2. On `Data`, create a table named **DischargeRecords** with these exact column names (order is flexible):

```
PatientID | AdmissionDate | PatientName | Room | AdmissionStatus | RecordID | DischargeDate | Cancelled | NoticeAt | Recipient | Messenger | Remarks | Signer | SignedAt
```

3. Enter at least one patient placeholder row, e.g. `012345678 | 2026-11-03 | שרה כהן | 12 | מאושפז`. Format PatientID and AdmissionDate columns as **Text** before entry (ISO dates `YYYY-MM-DD`).
4. On `Bridge`, create a second table named **BridgeQueue** with these exact headers in row 1, from A through P:

```
CommandID | Status | Action | PatientID | AdmissionDate | RecordID | DischargeDate | Cancelled | NoticeAt | Recipient | Messenger | Remarks | Signer | SignedAt | Result | Trigger
```

   Format PatientID and AdmissionDate columns as **Text** before data is added. Leave table rows empty initially. The table grows automatically as commands arrive.
5. Set calculation mode to Automatic. Each command row has its own Trigger formula referencing CommandID. No separate trigger cells are needed.
6. Open VBA editor (Alt+F11), paste [BridgeWorksheet.cls.txt](../vba/BridgeWorksheet.cls.txt) into the **Bridge worksheet code module** (not a standard module). Save and enable macros.
7. Open the add-in and click **טען מ־Excel**. Click a patient, fill the form, and click **הוסף**.

## Workflow

- Office.js appends a complete `PENDING` row to BridgeQueue.
- After adding the command row, Office.js inserts the formula `=[@CommandID]` in its Trigger cell (column P). This is intended to fire Worksheet_Calculate.
- VBA scans **all** `PENDING` rows. It checks `RecordID` for duplicates, adds a row to `DischargeRecords`, and sets `Status=DONE` or `ERROR` and writes `Result` to the **same queue row**.
- Office.js waits up to 15 seconds for that row to reach DONE/ERROR. On DONE it reloads the main data table. If VBA does not run, the row remains PENDING and is eligible for later processing.
- An ERROR row is retained for investigation; the sample processor does not automatically retry ERROR rows. A manually corrected row may be reset to PENDING, but only after checking whether its RecordID already exists in the data table.

## Important limitations

- **Workbook persistence:** an appended queue row exists in the open Excel workbook but is not guaranteed durable on disk until the workbook is saved. Do not close without saving. Automatic saving / recovery is not yet implemented.
- **Not tested end-to-end** in the corporate Excel environment. `Worksheet_Calculate` worked in an earlier isolated test, but queue integration still needs validation.
- **Single workbook prototype:** no external shared DischargeData.xlsx access, multi-user locking, or census synchronization yet.
- **No concurrent writer guarantee:** the current JavaScript appends directly to a shared table; multi-user access requires coordination.
- **Signature time:** SignedAt comes from JavaScript in this prototype; final code should use a trusted time source.
- **Audit protection:** direct edits to Excel rows can change history; appropriate workbook permissions and backups are needed.
- Never commit real patient data to the public repository.
