param(
    [switch]$NoChrome
)

$ErrorActionPreference = "Stop"
$scriptDir = "C:\AI\chatgpt-web-bot"
$serverScript = "$scriptDir\src\server.js"

Write-Host "=== chatgpt-web-bot: Start All ===" -ForegroundColor Cyan

# 1. Chrome with CDP
if (-not $NoChrome) {
    & "$scriptDir\start-chrome-cdp.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL: Chrome startup." -ForegroundColor Red
        exit 1
    }
}

# 2. Check if server is already running
$existingServer = Get-NetTCPConnection -LocalPort 3999 -ErrorAction SilentlyContinue
if ($existingServer) {
    Write-Host "OK. Server already running on port 3999 (PID $($existingServer.OwningProcess))." -ForegroundColor Green
} else {
    Write-Host "Starting server..." -ForegroundColor Yellow
    Start-Process -FilePath "node.exe" -ArgumentList $serverScript -WindowStyle Hidden
    Start-Sleep -Seconds 2
    
    $checkServer = Get-NetTCPConnection -LocalPort 3999 -ErrorAction SilentlyContinue
    if ($checkServer) {
        Write-Host "OK. Server started on port 3999 (PID $($checkServer.OwningProcess))." -ForegroundColor Green
    } else {
        Write-Host "FAIL. Server did not start." -ForegroundColor Red
        exit 1
    }
}

# 3. Quick test
Write-Host "Quick test..." -ForegroundColor Yellow
try {
    $test = Invoke-WebRequest -Uri "http://127.0.0.1:3999/v1/models" -UseBasicParsing -TimeoutSec 5
    $models = $test.Content | ConvertFrom-Json
    Write-Host "OK. Models endpoint: $($models.data.Count) model(s)." -ForegroundColor Green
} catch {
    Write-Host "FAIL. Models endpoint unreachable: $_" -ForegroundColor Red
    exit 1
}

Write-Host "=== All systems ready ===" -ForegroundColor Cyan
