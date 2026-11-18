# Real Excel + Office.js + VBA end-to-end smoke test

This is a **desktop Excel for Windows** prototype. It exercises the actual
`docs/index.html` UI → `ExcelTransport` → `BridgeQueue` →
`Worksheet_Calculate` → VBA → external Excel files → UI reload.

## Prepare files

1. On Windows with Excel installed, clone/download this repository and run:
   `powershell -ExecutionPolicy Bypass -File .\integration\setup-fixtures.ps1`
2. The script creates `%USERPROFILE%\ExcelBridgeTest\DischargeManager.xlsm`,
   `DischargeData.xlsx` and `Patients\Patients_2026-11-18.xlsx`.
   These are synthetic records, not patient data.
3. Open `DischargeManager.xlsm` and enable macros. Alt+F11:
   - File > Import File: `vba/BridgeProcessor.bas` (standard module).
   - In Microsoft Excel Objects > `Bridge`, paste the contents of
     `vba/BridgeWorksheet_Calculate.txt` (worksheet code).
   - Save the .xlsm. Excel calculation mode must be Automatic.
4. **VBA compile:** Debug > Compile VBAProject. Resolve any compile errors
   before continuing. The code is an integration prototype, not production
   hardened.

## Make the actual Office.js UI available

The `docs/index.html` page must be loaded **inside Excel as an Office
task pane**, not opened as a normal browser page. All browser modules are published inside `docs/src`. You can host
**only the `docs` directory** on GitHub Pages over HTTPS; no local web
server or root-level `/src` access is needed. The canonical JavaScript source lives in `docs/src` (no copies in a separate `src` tree).\n`npm test` checks that browser imports resolve and that no duplicate source tree is introduced.

Use an Office add-in manifest pointing its task pane source to
`https://YOUR-HOST/docs/index.html`, sideload the manifest in Excel,
and open the task pane in `DischargeManager.xlsm`.
Office.js requires a supported Excel host, trusted HTTPS, and macros enabled.

## Smoke-test sequence

1. In the task pane, click **טען מ־Excel**.
2. Inspect `BridgeQueue`: `INIT`, `READ_FILE Admissions`,
   `READ_FILE DischargeRecords` should be `DONE`.
3. Inspect `BridgeFiles`: two paths, kinds PATIENTS/DATA and timestamps.
4. Inspect `Staging_Admissions` and `Staging_DischargeRecords`:
   the external tables should have been copied.
5. Open a patient in the UI, add a discharge date and signer, and submit.
6. Inspect `BridgeQueue` for `WRITE_ROWS DONE`. Open the external
   `DischargeData.xlsx`: one new row in `DischargeRecords`.
7. Reload the task pane: the saved record should appear.
8. Test an error by temporarily changing Settings DataFilePath to a
   nonexistent path; `INIT` must report `ERROR` in the queue.

**If a command stays PENDING**, use Alt+F8 >
`ForceProcessBridgeQueue` to determine whether the failure is
`Worksheet_Calculate` firing or the VBA command handler itself.
The automatic formula trigger must be verified separately on your
Excel build.

## Current limitations

- Office.js → VBA has no direct supported macro call. The formula-trigger
  technique is an experimental desktop Excel integration and must be
  validated on the target workstation.
- VBA `WRITE_ROWS` supports INSERT/UPDATE but is not fully transactional,
  does not persist a batch-id ledger, and must **not** be used with real
  clinical records. No guaranteed exactly-once writes on retry.
- No automated Windows Excel CI: Node CI tests the JS/mock contract only.
- The generated workbook contains no VBA until imported manually.
- The sample data are entirely fictional.
