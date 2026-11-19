Attribute VB_Name = "BridgeProcessor"
Option Explicit

' Excel desktop (Windows). Interface workbook: BridgeQueue, BridgeFiles,
' Staging_Patients, Staging_Admissions, Staging_DischargeRecords,
' Staging_RecordChanges. External data workbook: Admissions, DischargeRecords.
Public Sub ProcessBridgeQueue()
    Static busy As Boolean
    If busy Then Exit Sub
    busy = True
    Dim q As ListObject, r As ListRow, action As String
    On Error GoTo Fatal
    Set q = ThisWorkbook.Worksheets("Bridge").ListObjects("BridgeQueue")
    For Each r In q.ListRows
        If CStr(Cell(q, r, "Status")) = "PENDING" Then
            On Error GoTo JobError
            SetQueueValue q, r, "Status", "RUNNING"
            action = CStr(Cell(q, r, "Action"))
            Select Case action
                Case "PING": SetQueueValue q, r, "Result", "{""pong"":true}"
                Case "INIT": DoInit q, r
                Case "READ_FILE": DoRead q, r
                Case "WRITE_ROWS": DoWrite q, r
                Case Else: Err.Raise vbObjectError + 501, , "Unsupported action: " & action
            End Select
            SetQueueValue q, r, "Status", "DONE"
            On Error GoTo Fatal
        End If
ContinueJob:
    Next r
Fatal:
    busy = False
    Exit Sub
JobError:
    Dim message As String
    message = Err.Description
    Err.Clear
    On Error Resume Next
    SetQueueValue q, r, "Error", message
    SetQueueValue q, r, "Status", "ERROR"
    On Error GoTo Fatal
    Resume ContinueJob
End Sub

Public Sub ForceProcessBridgeQueue()
    ProcessBridgeQueue
End Sub

Private Sub DoInit(ByVal q As ListObject, ByVal r As ListRow)
    Dim folder As String, dataPath As String, latest As String
    folder = SettingValue("PatientsFolder")
    dataPath = SettingValue("DataFilePath")
    If Len(folder) = 0 Or Len(dataPath) = 0 Then Err.Raise 5, , "Missing Settings"
    latest = LatestXlsx(folder)
    If Len(latest) = 0 Then Err.Raise 5, , "No patient files in " & folder
    If Len(Dir(dataPath)) = 0 Then Err.Raise 5, , "Data file not found: " & dataPath
    Dim meta As ListObject
    Set meta = FindTable("BridgeFiles")
    ClearTable meta
    AppendMeta meta, "PATIENTS", latest
    AppendMeta meta, "DATA", dataPath
    SetQueueValue q, r, "Result", "{""files"":[" & FileJson("PATIENTS", latest) & "," & FileJson("DATA", dataPath) & "]}"
End Sub

Private Sub DoRead(ByVal q As ListObject, ByVal r As ListRow)
    Dim path As String, tableName As String, dest As String
    path = CStr(Cell(q, r, "Path"))
    tableName = CStr(Cell(q, r, "TableName"))
    dest = CStr(Cell(q, r, "SheetName"))
    If Len(path) = 0 Or Len(dest) = 0 Then Err.Raise 5, , "READ_FILE missing Path/SheetName"
    Dim wb As Workbook, source As ListObject, target As ListObject
    Set target = FindTable(dest)
    Set wb = Workbooks.Open(path, ReadOnly:=True, UpdateLinks:=False)
    On Error GoTo ReadFail
    If Len(tableName) > 0 Then
        Set source = FindTableIn(wb, tableName)
    Else
        Set source = wb.Worksheets(1).ListObjects(1)
    End If
    CopyTable source, target
    SetQueueValue q, r, "Result", "{""sheet"":" & Quote(dest) & ",""rowCount"":" & source.ListRows.Count & ",""modifiedAt"":" & Quote(FileStamp(path)) & "}"
    wb.Close SaveChanges:=False
    Exit Sub
ReadFail:
    Dim msg As String
    msg = Err.Description
    On Error Resume Next
    wb.Close SaveChanges:=False
    Err.Raise vbObjectError + 502, , msg
End Sub

Private Sub DoWrite(ByVal q As ListObject, ByVal r As ListRow)
    Dim path As String, tableName As String, sheetName As String
    path = CStr(Cell(q, r, "Path"))
    tableName = CStr(Cell(q, r, "TableName"))
    sheetName = CStr(Cell(q, r, "SheetName"))
    If Len(path) = 0 Or Len(tableName) = 0 Or Len(sheetName) = 0 Then Err.Raise 5, , "WRITE_ROWS missing target"
    Dim expected As String
    expected = CStr(Cell(q, r, "ExpectedModifiedAt"))
    If Len(expected) > 0 And expected <> FileStamp(path) Then Err.Raise 5, , "File changed since read"
    Dim source As ListObject, wb As Workbook, target As ListObject
    Set source = FindTable(sheetName)
    Set wb = Workbooks.Open(path, ReadOnly:=False, UpdateLinks:=False)
    On Error GoTo WriteFail
    If wb.ReadOnly Then Err.Raise 5, , "Data file is read-only"
    Set target = FindTableIn(wb, tableName)
    Dim expectedRows As String
    expectedRows = CStr(Cell(q, r, "ExpectedRows"))
    If Len(expectedRows) > 0 And CLng(expectedRows) <> target.ListRows.Count Then Err.Raise 5, , "File row count changed"
    Dim change As ListRow, operation As String, idx As Long, col As ListColumn, added As ListRow, recordId As String
    For Each change In source.ListRows
        operation = UCase$(CStr(Cell(source, change, "operation")))
        If operation = "INSERT" Then
            recordId = CStr(Cell(source, change, "RecordID"))
            If Len(recordId) > 0 And HasRecordId(target, recordId) Then Err.Raise 5, , "Duplicate RecordID"
            Set added = target.ListRows.Add
        ElseIf operation = "UPDATE" Then
            idx = CLng(Cell(source, change, "rowIndex")) + 1
            If idx < 1 Or idx > target.ListRows.Count Then Err.Raise 5, , "Invalid rowIndex"
            Set added = target.ListRows(idx)
        Else
            Err.Raise 5, , "Unsupported operation: " & operation
        End If
        For Each col In target.ListColumns
            If HasColumn(source, col.Name) Then SetQueueValue target, added, col.Name, Cell(source, change, col.Name)
        Next col
    Next change
    wb.Save
    wb.Close SaveChanges:=False
    SetQueueValue q, r, "Result", "{""written"":" & source.ListRows.Count & ",""modifiedAt"":" & Quote(FileStamp(path)) & "}"
    Exit Sub
WriteFail:
    Dim msg As String
    msg = Err.Description
    On Error Resume Next
    wb.Close SaveChanges:=False
    Err.Raise vbObjectError + 503, , msg
End Sub

Private Function HasRecordId(ByVal t As ListObject, ByVal id As String) As Boolean
    If Not HasColumn(t, "RecordID") Then Exit Function
    Dim row As ListRow
    For Each row In t.ListRows
        If CStr(Cell(t, row, "RecordID")) = id Then HasRecordId = True: Exit Function
    Next row
End Function

Private Sub CopyTable(ByVal src As ListObject, ByVal dst As ListObject)
    Dim row As ListRow, added As ListRow, col As ListColumn
    ClearTable dst
    For Each row In src.ListRows
        Set added = dst.ListRows.Add
        For Each col In dst.ListColumns
            If HasColumn(src, col.Name) Then SetQueueValue dst, added, col.Name, Cell(src, row, col.Name)
        Next col
    Next row
End Sub

Private Sub ClearTable(ByVal t As ListObject)
    Do While t.ListRows.Count > 0
        t.ListRows(1).Delete
    Loop
End Sub

Private Function FindTable(ByVal name As String) As ListObject
    Set FindTable = FindTableIn(ThisWorkbook, name)
End Function

Private Function FindTableIn(ByVal wb As Workbook, ByVal name As String) As ListObject
    Dim sh As Worksheet, t As ListObject
    For Each sh In wb.Worksheets
        For Each t In sh.ListObjects
            If StrComp(t.Name, name, vbTextCompare) = 0 Then Set FindTableIn = t: Exit Function
        Next t
    Next sh
    Err.Raise 5, , "Excel table not found: " & name
End Function

Private Function HasColumn(ByVal t As ListObject, ByVal name As String) As Boolean
    Dim c As ListColumn
    For Each c In t.ListColumns
        If StrComp(c.Name, name, vbTextCompare) = 0 Then HasColumn = True: Exit Function
    Next c
End Function

Private Function Cell(ByVal t As ListObject, ByVal r As ListRow, ByVal name As String) As Variant
    Cell = r.Range.Cells(1, t.ListColumns(name).Index).Value2
End Function

Private Sub SetQueueValue(ByVal t As ListObject, ByVal r As ListRow, ByVal name As String, ByVal v As Variant)
    r.Range.Cells(1, t.ListColumns(name).Index).Value2 = v
End Sub

Private Function SettingValue(ByVal key As String) As String
    Dim sh As Worksheet, i As Long
    Set sh = ThisWorkbook.Worksheets("Settings")
    For i = 2 To sh.Cells(sh.Rows.Count, 1).End(xlUp).Row
        If CStr(sh.Cells(i, 1).Value2) = key Then SettingValue = CStr(sh.Cells(i, 2).Value2): Exit Function
    Next i
End Function

Private Function LatestXlsx(ByVal folder As String) As String
    Dim name As String, path As String, newest As Date
    If Right$(folder, 1) <> "\" Then folder = folder & "\"
    name = Dir(folder & "*.xls*")
    Do While Len(name) > 0
        If Left$(name, 2) <> "~$" Then
            path = folder & name
            If FileDateTime(path) > newest Then newest = FileDateTime(path): LatestXlsx = path
        End If
        name = Dir()
    Loop
End Function

Private Function FileStamp(ByVal path As String) As String
    FileStamp = Format$(FileDateTime(path), "yyyy-mm-dd\Thh:nn:ss")
End Function

Private Sub AppendMeta(ByVal t As ListObject, ByVal kind As String, ByVal path As String)
    Dim row As ListRow
    Set row = t.ListRows.Add
    SetQueueValue t, row, "Kind", kind
    SetQueueValue t, row, "Path", path
    SetQueueValue t, row, "ModifiedAt", FileStamp(path)
    SetQueueValue t, row, "Size", FileLen(path)
End Sub

Private Function Quote(ByVal s As String) As String
    Quote = """" & Replace(Replace(Replace(s, "\", "\\"), """", "\"""), vbCrLf, "\n") & """"
End Function

Private Function FileJson(ByVal kind As String, ByVal path As String) As String
    FileJson = "{""kind"":" & Quote(kind) & ",""path"":" & Quote(path) & ",""modifiedAt"":" & Quote(FileStamp(path)) & ",""size"":" & FileLen(path) & "}"
End Function
