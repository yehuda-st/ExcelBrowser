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
