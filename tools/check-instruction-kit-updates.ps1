param(
    [string]$InstructionKitPath = "tools/project-memory/instruction-kit.json",
    [string]$SharedLibraryPath = "",
    [switch]$RecordApplied,
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

function Test-UsablePath {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $false
    }

    try {
        return Test-Path -LiteralPath $Path
    }
    catch {
        return $false
    }
}

function Resolve-SharedLibraryPath {
    param(
        [object]$Kit,
        [string]$ExplicitPath
    )

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitPath)) {
        $candidates += [string]$ExplicitPath
    }
    if ($env:GENERAL_INSTRUCTIONS_HOME) {
        $candidates += [string]$env:GENERAL_INSTRUCTIONS_HOME
    }
    if ($Kit.update_check -and $Kit.update_check.shared_library_path) {
        $candidates += [string]$Kit.update_check.shared_library_path
    }

    foreach ($candidate in ($candidates | Select-Object -Unique)) {
        if (Test-UsablePath -Path $candidate) {
            return $candidate
        }
    }

    return $null
}

if (-not (Test-Path -LiteralPath $InstructionKitPath)) {
    Write-Host "No instruction kit metadata found at $InstructionKitPath."
    Write-Host "Bootstrap this project from the shared instruction library first."
    exit 1
}

$kit = Get-Content -LiteralPath $InstructionKitPath -Raw | ConvertFrom-Json

$sharedPath = Resolve-SharedLibraryPath -Kit $kit -ExplicitPath $SharedLibraryPath

if (-not $sharedPath) {
    Write-Host "No usable shared instruction library path found."
    Write-Host "Set GENERAL_INSTRUCTIONS_HOME, pass -SharedLibraryPath, or update update_check.shared_library_path."
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

if ($Apply) {
    Write-Host ""
    Write-Host "-Apply is intentionally disabled because it can mark migrations applied before file changes exist."
    Write-Host "Have an agent apply the pending migration instructions first."
    Write-Host "After verifying the file changes, run with -RecordApplied to update metadata."
    exit 1
}

Write-Host ""
if (-not $RecordApplied) {
    Write-Host "Review CHANGELOG.md and have an agent apply each pending migration's file changes."
    Write-Host "After verifying the file changes, run with -RecordApplied to update metadata."
    exit 0
}

Write-Host "Recording migration metadata only after file changes were applied and verified."
Write-Host "If file changes are not complete, stop now and do not record migrations as applied."

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
