param(
    [int]$Port = 9222,
    [string]$ChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe",
    [string]$UserDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data",
    [string]$StartUrl = "https://chatgpt.com/"
)

$ErrorActionPreference = "Stop"

# Check if port is already taken by Chrome
$existing = netstat -ano 2>$null | Select-String "127.0.0.1:$Port"
if ($existing) {
    $procId = ($existing -split '\s+')[-1]
    try {
        $proc = Get-Process -Id $procId -ErrorAction Stop
        if ($proc.ProcessName -eq 'chrome') {
            Write-Host "OK. Chrome with CDP port $Port already running (PID $procId)." -ForegroundColor Green
            exit 0
        }
    } catch { }
}

# Launch Chrome with remote debugging
Write-Host "Starting Chrome with remote debugging (port $Port)..." -ForegroundColor Yellow
Write-Host "  Profile: $UserDataDir"
Write-Host "  URL: $StartUrl"

Start-Process -FilePath $ChromePath -ArgumentList @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$UserDataDir",
    $StartUrl
)

Start-Sleep -Seconds 3

$check = netstat -ano 2>$null | Select-String "127.0.0.1:$Port"
if ($check) {
    $procId = ($check -split '\s+')[-1]
    Write-Host "OK. Chrome started (PID $procId), CDP port $Port active." -ForegroundColor Green
} else {
    Write-Host "FAIL. Chrome did not start or CDP port not opened." -ForegroundColor Red
    exit 1
}
