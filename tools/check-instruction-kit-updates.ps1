param(
    [string]$InstructionKitPath = "tools/project-memory/instruction-kit.json",
    [switch]$Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-VersionFromFile {
    param([Parameter(Mandatory = $true)][string]$VersionFile)

    if (-not (Test-Path -LiteralPath $VersionFile)) {
        return $null
    }

    $match = Select-String -Path $VersionFile -Pattern '`([0-9]{4}\.[0-9]{2}\.[0-9]{2}(?:\.[0-9]+)?)`' | Select-Object -First 1
    if ($match -and $match.Matches.Count -gt 0) {
        return $match.Matches[0].Groups[1].Value
    }

    return $null
}

if (-not (Test-Path -LiteralPath $InstructionKitPath)) {
    Write-Host "No instruction kit metadata found at $InstructionKitPath."
    Write-Host "Bootstrap this project from the shared instruction library first."
    exit 1
}

$kit = Get-Content -LiteralPath $InstructionKitPath -Raw | ConvertFrom-Json

$sharedPath = $null
if ($kit.update_check -and $kit.update_check.shared_library_path) {
    $sharedPath = [string]$kit.update_check.shared_library_path
}
elseif ($env:GENERAL_INSTRUCTIONS_HOME) {
    $sharedPath = $env:GENERAL_INSTRUCTIONS_HOME
}

if (-not $sharedPath) {
    Write-Host "No shared instruction library path configured."
    Write-Host "Set update_check.shared_library_path or GENERAL_INSTRUCTIONS_HOME."
    exit 1
}

$versionFile = Join-Path $sharedPath "VERSION.md"
$migrationsPath = Join-Path $sharedPath "migrations"
$latestVersion = Get-VersionFromFile -VersionFile $versionFile

if (-not $latestVersion) {
    Write-Host "Could not read shared instruction version from $versionFile."
    exit 1
}

$installedVersion = [string]$kit.instruction_kit_version
$applied = @()
if ($kit.applied_migrations) {
    $applied = @($kit.applied_migrations | ForEach-Object { [string]$_ })
}

Write-Host "Installed instruction kit: $installedVersion"
Write-Host "Available instruction kit: $latestVersion"

if (-not (Test-Path -LiteralPath $migrationsPath)) {
    Write-Host "No migrations folder found at $migrationsPath."
    exit 0
}

$pending = Get-ChildItem -LiteralPath $migrationsPath -Filter "*.md" |
    Where-Object { $_.Name -ne "README.md" } |
    Sort-Object Name |
    Where-Object {
        $migrationId = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
        $applied -notcontains $migrationId
    }

if (-not $pending) {
    Write-Host "No pending instruction migrations."
    exit 0
}

Write-Host ""
Write-Host "Pending instruction migrations:"
$pending | ForEach-Object { Write-Host "- $($_.Name)" }

if (-not $Apply) {
    Write-Host ""
    Write-Host "Review CHANGELOG.md and run with -Apply when ready."
    exit 0
}

Write-Host ""
Write-Host "This script records migration metadata only."
Write-Host "Apply each migration's file changes with an agent following patterns/INSTRUCTION_KIT_MIGRATIONS.md."

$newApplied = @($applied)
foreach ($migration in $pending) {
    $newApplied += [System.IO.Path]::GetFileNameWithoutExtension($migration.Name)
}

$kit.instruction_kit_version = $latestVersion
$kit | Add-Member -NotePropertyName applied_migrations -NotePropertyValue $newApplied -Force
$kit | Add-Member -NotePropertyName last_update_check_at -NotePropertyValue (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK") -Force
$kit | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $InstructionKitPath -Encoding UTF8

Write-Host "Recorded pending migrations as applied in $InstructionKitPath."
Write-Host "Only do this after the agent has applied the migration instructions."
