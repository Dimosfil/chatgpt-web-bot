# Test both endpoints: /v1/chat/completions (OpenClaw) and /v1/responses (Codex)

Write-Host "=== 1. GET /v1/models ==="
$models = Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:3999/v1/models" -Method Get
$models | ConvertTo-Json -Depth 3

Write-Host "`n=== 2. POST /v1/chat/completions (OpenClaw mode) ==="
$chatBody = @{
    model = "chatgpt-web"
    messages = @(
        @{ role = "user"; content = "Say hello in russian, just one word" }
    )
    stream = $false
} | ConvertTo-Json -Compress

try {
    $chatResult = Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:3999/v1/chat/completions" -Method Post -ContentType "application/json" -Body $chatBody -TimeoutSec 90
    Write-Host "OK - Response:`n$($chatResult | ConvertTo-Json -Depth 5)"
    Write-Host "Content: $($chatResult.choices[0].message.content)"
} catch {
    Write-Host "ERROR: $_"
}

Write-Host "`n=== 3. POST /v1/responses (Codex mode) ==="
$respBody = @{
    model = "chatgpt-web"
    input = "Say hello in russian, just one word"
    stream = $false
} | ConvertTo-Json -Compress

try {
    $respResult = Invoke-RestMethod -UseBasicParsing -Uri "http://localhost:3999/v1/responses" -Method Post -ContentType "application/json" -Body $respBody -TimeoutSec 90
    Write-Host "OK - Response:`n$($respResult | ConvertTo-Json -Depth 5)"
    Write-Host "Output text: $($respResult.output_text)"
} catch {
    Write-Host "ERROR: $_"
}

Write-Host "`n=== Done ==="
