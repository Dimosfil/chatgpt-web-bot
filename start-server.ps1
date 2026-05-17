# Start chatgpt-web-bot server
$root = $PSScriptRoot
$procId = (Get-NetTCPConnection -LocalPort 3999 -ErrorAction SilentlyContinue).OwningProcess
if ($procId) {
    Write-Host "Server already running (PID $procId). Use stop-server first." -ForegroundColor Yellow
    exit 1
}

Write-Host "Starting chatgpt-web-bot server..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/c title chatgpt-web-bot-server && node .\src\server.js" -WorkingDirectory $root -WindowStyle Normal
Start-Sleep 2

$newPid = (Get-NetTCPConnection -LocalPort 3999 -ErrorAction SilentlyContinue).OwningProcess
if ($newPid) {
    Write-Host "Server started (PID $newPid, port 3999)" -ForegroundColor Green
} else {
    Write-Host "Server may not have started. Check port 3999." -ForegroundColor Red
}
