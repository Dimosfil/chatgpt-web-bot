# Stop chatgpt-web-bot server
$procId = (Get-NetTCPConnection -LocalPort 3999 -ErrorAction SilentlyContinue).OwningProcess
if (-not $procId) {
    Write-Host "No server running on port 3999." -ForegroundColor Yellow
    exit 0
}

Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
Write-Host "Server (PID $procId) stopped." -ForegroundColor Green
