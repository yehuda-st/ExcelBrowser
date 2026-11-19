# Run on Windows with desktop Excel installed:
# powershell -ExecutionPolicy Bypass -File .\integration\setup-fixtures.ps1
$ErrorActionPreference='Stop'
$root=Join-Path $env:USERPROFILE 'ExcelBridgeTest'
$patients=Join-Path $root 'Patients'
New-Item -ItemType Directory -Force $patients | Out-Null
$excel=New-Object -ComObject Excel.Application
$excel.Visible=$false
$excel.DisplayAlerts=$false

function AddTable($wb,$sheetName,$tableName,$headers,$rows) {
  $ws=$wb.Worksheets.Add()
  $ws.Name=$sheetName
  for($i=0;$i -lt $headers.Count;$i++){ $ws.Cells.Item(1,$i+1).NumberFormat='@';$ws.Cells.Item(1,$i+1).Value2=[string]$headers[$i] }
  $n=2
  foreach($row in $rows){
    for($i=0;$i -lt $headers.Count;$i++){
      $ws.Cells.Item($n,$i+1).NumberFormat='@'
      $ws.Cells.Item($n,$i+1).Value2=[string]$row[$i]
    }
    $n++
  }
  $end=[Math]::Max(2,$n-1)
  $range=$ws.Range($ws.Cells.Item(1,1),$ws.Cells.Item($end,$headers.Count))
  $table=$ws.ListObjects.Add(1,$range,$null,1)
  $table.Name=$tableName
  if($tableName -eq 'BridgeQueue') {
    # Trigger must be General so Office.js can write a real Excel formula.
    $table.ListColumns.Item('Trigger').Range.NumberFormat='General'
  }
  if($rows.Count -eq 0){$table.ListRows.Item(1).Delete()}
  $ws.Columns.AutoFit() | Out-Null
}
$ad=@('PatientID','AdmissionDate','PatientName','Room','AdmissionStatus')
$rec=@('RecordID','PatientID','AdmissionDate','DischargeDate','Cancelled','NoticeAt','Recipient','Messenger','Remarks','Signer','SignedAt')
$adRows=New-Object System.Collections.ArrayList
# Build Hebrew status from Unicode code points: Windows PowerShell 5.1 may misread UTF-8 scripts without BOM.
$admitted=-join ([char[]]@(0x05DE,0x05D0,0x05D5,0x05E9,0x05E4,0x05D6))
[void]$adRows.Add(@('000000001','2026-11-01','Test Patient One','12',$admitted))
[void]$adRows.Add(@('000000002','2026-11-02','Test Patient Two','14',$admitted))

# Use the same 28 columns and ordering as the Prometheus export.
$patientHeaders=@('שם','סוג חולה','רגישויות','בידוד','חיידק עמיד','מעקב','מ.קליני','ד.סעודי','תרופות','תרופה בהשהייה','הוראות','תוכניות','סימנים','אירועים למעקב','אנטיביוטיקה','הזמנות','חדר/מיטה','יעוצים','מעבדות','מכונים','טפסים','אבחנות','ימים','מצב המטופל','שיחות מטופל/משפחה','רצף טיפולי','ממצא חריג','הדפס')
function NewPrometheusRow($name,$patientId,$gender,$age,$bed,$days) {
  $row=New-Object 'string[]' $patientHeaders.Count
  $row[0]="$name        $patientId-P $gender,$age"
  $row[2]='C';$row[4]='N';$row[6]='O';$row[7]='C';$row[8]='C'
  $row[9]='C';$row[10]='N';$row[11]='O';$row[14]='אין אנטיביוטיקה'
  $row[15]='C';$row[16]=[string]$bed;$row[17]='O';$row[18]='C'
  $row[19]='C';$row[20]='Y';$row[21]='Y';$row[22]=[string]$days
  $row[24]='יש לבצע שיחה';$row[25]='E';$row[26]='לא קיים ממצא חריג/שינוי משמעותי'
  return ,$row
}
$patientRows=@(
  (NewPrometheusRow 'מטופל 5EB18D19' '97790615' 'נ' 95 '1' 13),
  (NewPrometheusRow 'מטופל 9F6B1E90' '97712864' 'נ' 84 '17' 35),
  (NewPrometheusRow 'מטופל D501B846' '62202733' 'ז' 79 '18' 1)
)
try {
  $wb=$excel.Workbooks.Add()
  AddTable $wb 'Patients' 'Patients' $patientHeaders $patientRows
  $wb.SaveAs((Join-Path $patients ('Patients_'+(Get-Date -Format 'yyyy-MM-dd')+'.xlsx')),51)
  $wb.Close($false)

  $wb=$excel.Workbooks.Add()
  AddTable $wb 'Admissions' 'Admissions' $ad @()
  AddTable $wb 'DischargeRecords' 'DischargeRecords' $rec @()
  $wb.SaveAs((Join-Path $root 'DischargeData.xlsx'),51)
  $wb.Close($false)

  $wb=$excel.Workbooks.Add()
  $settings=$wb.Worksheets.Item(1);$settings.Name='Settings'
  $settings.Cells.Item(1,1).Value2='Key';$settings.Cells.Item(1,2).Value2='Value'
  $settings.Cells.Item(2,1).Value2='PatientsFolder';$settings.Cells.Item(2,2).Value2=$patients
  $settings.Cells.Item(3,1).Value2='DataFilePath';$settings.Cells.Item(3,2).Value2=(Join-Path $root 'DischargeData.xlsx')
  AddTable $wb 'Bridge' 'BridgeQueue' @('CommandID','Status','Action','Path','TableName','SheetName','ExpectedModifiedAt','ExpectedRows','BatchID','Result','Error','Trigger') @()
  AddTable $wb 'BridgeFilesSheet' 'BridgeFiles' @('Kind','Path','ModifiedAt','Size') @()
  AddTable $wb 'PatientsStaging' 'Staging_Patients' $ad @()
  AddTable $wb 'AdmissionsStaging' 'Staging_Admissions' $ad @()
  AddTable $wb 'RecordsStaging' 'Staging_DischargeRecords' $rec @()
  AddTable $wb 'ChangesStaging' 'Staging_RecordChanges' (@('operation','rowIndex')+$rec+@('PatientName','Room','AdmissionStatus')) @()
  $wb.SaveAs((Join-Path $root 'DischargeManager.xlsm'),52)
  $wb.Close($false)
  Write-Host "Created sample files under $root"
  Write-Host 'IMPORTANT: Import vba/BridgeProcessor.bas and paste vba/BridgeWorksheet_Calculate.txt into Bridge sheet VBA module.'
} finally {
  $excel.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
