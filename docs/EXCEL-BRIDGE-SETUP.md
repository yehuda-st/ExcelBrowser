# Excel ↔ Office.js bridge (first working prototype)

This prototype connects the existing task pane to an Excel table **in the same interface workbook**. It does **not yet** open, lock, or update the separate shared DischargeData.xlsx file. Patient data stays in Excel, not on GitHub Pages.

## Workbook setup

1. Create an Excel macro-enabled workbook (`.xlsm`) with worksheets named `Data` and `Bridge`.
2. In `Data`, create an Excel Table named **DischargeRecords**, with these headers in exactly this spelling (order is flexible):

```
PatientID | AdmissionDate | PatientName | Room | AdmissionStatus | RecordID | DischargeDate | Cancelled | NoticeAt | Recipient | Messenger | Remarks | Signer | SignedAt
```

3. Enter at least one census row, e.g. `012345678 | 2026-11-03 | שרה כהן | 12 | מאושפז`. Keep the other fields empty. **Set PatientID and AdmissionDate columns to Text before entering values**. Date format is `YYYY-MM-DD`. This preserves leading zeroes.
4. In `Bridge!A3`, enter **`=A1`**. Set Excel calculation mode to **Automatic**.
5. In the VBA editor (Alt+F11), open the **Bridge worksheet's code window** and paste the contents of [BridgeWorksheet.cls.txt](../vba/BridgeWorksheet.cls.txt). Enable macros and save.
6. Open the add-in and click **טען מ־Excel**. Opening a patient and clicking **הוסף** will send a command to VBA and append a new row to the table.

## Bridge protocol

| Cell | Content |
|---|---|
| A1 | Unique command ID; **written last** by Office.js |
| A2:L2 | ADD, PatientID, AdmissionDate, RecordID, DischargeDate, Cancelled, NoticeAt, Recipient, Messenger, Remarks, Signer, SignedAt |
| A3 | `=A1` — calculation event trigger |
| A4 | PENDING / SUCCESS / ERROR |
| A5 | Human-readable result |
| A6 | Acknowledged command ID |

The UI waits for matching `A6` and success/error status before refreshing the table. On timeout it warns **not to resubmit blindly**, because the operation may already have succeeded.

## Important limitations

- Excel's `Worksheet_Calculate` trigger has been observed in the user's environment, but this full end-to-end flow has **not yet been tested on the corporate desktop**.
- The sample VBA writes to the table in the interface workbook only; shared-file locking, census synchronization, and durable saving are the next phase.
- SignedAt is currently supplied by JavaScript; the final VBA implementation should use the trusted workstation time at successful append.
- Excel Tables do not enforce immutability against direct workbook editing. A proper audit trail requires permissions and backups.
- Keep real patient information out of this public repository.
