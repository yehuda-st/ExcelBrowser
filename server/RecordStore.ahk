#Requires AutoHotkey v2.0

RecordColumns() => ["RecordID","PatientID","AdmissionDate","DischargeDate","Cancelled","NoticeAt","Recipient","Messenger","Remarks","Signer","SignedAt","PatientName","Room"]

ParseRecordCsv(csv) {
    rows := [], row := [], field := "", quoted := false, closed := false
    i := 1
    while i <= StrLen(csv) {
        c := SubStr(csv, i++, 1)
        if quoted {
            if c = '"' {
                if SubStr(csv, i, 1) = '"'
                    field .= '"', i++
                else
                    quoted := false, closed := true
            } else
                field .= c
            continue
        }
        if closed && c != "," && c != Chr(13) && c != Chr(10)
            throw Error("Invalid CSV")
        if c = '"' {
            if field != "" || closed
                throw Error("Invalid CSV")
            quoted := true
        } else if c = "," {
            row.Push(field), field := "", closed := false
        } else if c = Chr(13) || c = Chr(10) {
            if c = Chr(13) && SubStr(csv, i, 1) = Chr(10)
                i++
            row.Push(field)
            if row.Length > 1 || row[1] != ""
                rows.Push(row)
            row := [], field := "", closed := false
        } else
            field .= c
    }
    if quoted
        throw Error("Incomplete CSV")
    if row.Length || field != "" || closed {
        row.Push(field)
        rows.Push(row)
    }
    return rows
}

EncodeRecordRow(values) {
    line := ""
    for value in values
        line .= (A_Index = 1 ? "" : ",") '"' StrReplace(String(value), '"', '""') '"'
    return line Chr(13) Chr(10)
}

AppendRecord(file, payload) {
    if !(payload is Map) || !payload.Has("row") || !payload.Has("expectedRecordID")
        return 400
    row := payload["row"], expected := payload["expectedRecordID"]
    if !(row is Map) || IsObject(expected)
        return 400
    columns := RecordColumns(), values := []
    for column in columns {
        if !row.Has(column) || IsObject(row[column])
            return 400
        values.Push(row[column])
    }
    if row["RecordID"] = "" || row["PatientID"] = "" || !RegExMatch(row["AdmissionDate"], "^\d{4}-\d{2}-\d{2}$") || row["Signer"] = "" || row["SignedAt"] = ""
        return 400
    ; All server instances use the same exclusive sidecar handle.
    ; The lock file remains on disk; Windows releases the handle on process exit.
    lock := FileOpen(file ".lock", "a -rwd")
    if !IsObject(lock)
        return 409
    temp := ""
    try {
        csv := FileRead(file, "UTF-8")
        rows := ParseRecordCsv(csv)
        if !rows.Length || rows[1].Length != columns.Length
            return 503
        for column in columns
            if rows[1][A_Index] !== column
                return 503
        latest := ""
        ids := Map()
        for existing in rows {
            if A_Index = 1
                continue
            if existing.Length != columns.Length || existing[1] = "" || ids.Has(existing[1])
                return 503
            ids[existing[1]] := true
            if existing[1] == String(row["RecordID"])
                return 409
            if existing[2] == String(row["PatientID"]) && existing[3] == String(row["AdmissionDate"])
                latest := existing[1]
        }
        if latest !== String(expected)
            return 409
        if csv != "" && SubStr(csv, -1) != Chr(10) && SubStr(csv, -1) != Chr(13)
            csv .= Chr(13) Chr(10)
        temp := file ".tmp." DllCall("GetCurrentProcessId", "UInt") "." A_TickCount
        out := FileOpen(temp, "w", "UTF-8")
        try {
            out.Write(csv EncodeRecordRow(values))
            if !DllCall("FlushFileBuffers", "Ptr", out.Handle)
                throw OSError()
        } finally {
            out.Close()
        }
        ; Replace in the same directory only after the complete new file is flushed.
        if !DllCall("MoveFileExW", "Str", temp, "Str", file, "UInt", 9)
            throw OSError()
        temp := ""
        return 201
    } finally {
        if temp != "" && FileExist(temp)
            try FileDelete(temp)
        lock.Close()
    }
}
