#Requires AutoHotkey v2.0
#SingleInstance Ignore
#Include vendor\HttpServer.ahk

Persistent()
config := A_ScriptDir "\config.ini"
port := Integer(IniRead(config, "Server", "Port", "8765"))
if port < 1025 || port > 65535
    throw Error("Invalid server port")
baseUrl := "http://127.0.0.1:" port "/"
server := HttpServer()
server.Add(baseUrl, HandleRequest)
if StrLower(IniRead(config, "Server", "AutoOpenBrowser", "true")) = "true"
    Run(baseUrl)

HandleRequest(req, rsp) {
    rsp["Cache-Control"] := "no-store"
    rsp["X-Content-Type-Options"] := "nosniff"
    if req.Verb != "GET" {
        rsp("Method not allowed", 405)
        return
    }
    if req.AbsPath = "/api/health" {
        rsp["Content-Type"] := "application/json"
        rsp('{"status":"ok"}')
        return
    }
    if req.AbsPath = "/api/patients" || req.AbsPath = "/api/records" {
        ServeCsv(req, rsp)
        return
    }
    path := req.AbsPath = "/" ? "/index.html" : req.AbsPath
    ; Only serve application assets, never arbitrary filesystem paths.
    if !RegExMatch(path, "^/(?:index\.html|discharge-data-adapter\.js|icon\.png|src/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.js)$") {
        rsp("Not found", 404)
        return
    }
    file := A_ScriptDir "\..\docs" StrReplace(path, "/", "\")
    if !FileExist(file) {
        rsp("Not found", 404)
        return
    }
    SplitPath(file, , , &ext)
    mime := Map("html", "text/html", "js", "text/javascript", "png", "image/png")
    rsp["Content-Type"] := mime[ext]
    rsp(HttpServer.File(file))
}

ServeCsv(req, rsp) {
    global config, baseUrl
    ; Require the application client header and reject cross-origin requests.
    if req.Headers.Get("X-Discharge-Client", "") != "1"
        || (req.Headers.Has("Origin") && req.Headers["Origin"] != RTrim(baseUrl, "/"))
        || req.Headers.Get("Sec-Fetch-Site", "same-origin") = "cross-site" {
        rsp("Forbidden", 403)
        return
    }
    key := req.AbsPath = "/api/patients" ? "PatientsFile" : "DischargeRecordsFile"
    try {
        file := IniRead(config, "Data", key, "")
        if file = "" {
            rsp("Data file not configured", 503)
            return
        }
        if !RegExMatch(file, "i)^(?:[A-Z]:\\|\\\\)")
            file := A_ScriptDir "\\" file
        if !FileExist(file) {
            rsp("Data file unavailable", 503)
            return
        }
        csv := FileRead(file, "UTF-8")
        rsp["Content-Type"] := "text/csv"
        rsp(csv)
    } catch {
        rsp("Unable to read data file", 503)
    }
}
