param()

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$installer = Join-Path $scriptDir "install_worker.ps1"
$statusFile = Join-Path $repoRoot "logs\worker-install-status.json"
$shimDir = Join-Path ([System.IO.Path]::GetTempPath()) ("worker-installer-shims-" + [System.Guid]::NewGuid().ToString("N"))
$originalPath = $env:Path

function Write-Shim {
    param(
        [string]$Name,
        [string]$Content
    )
    Set-Content -Path (Join-Path $shimDir $Name) -Value $Content -Encoding ASCII
}

if (-not (Test-Path -LiteralPath $installer)) {
    throw "Installer was not found: $installer"
}

try {
    New-Item -ItemType Directory -Path $shimDir | Out-Null

    Write-Shim -Name "node.cmd" -Content @"
@echo off
if "%~1"=="--version" (
  echo v20.0.0
  exit /b 0
)
echo node shim accepted %*
exit /b 0
"@

    Write-Shim -Name "npm.cmd" -Content @"
@echo off
if "%~1"=="--version" (
  echo 10.0.0
  exit /b 0
)
echo npm shim forced failure 1>&2
exit /b 42
"@

    Write-Shim -Name "npx.cmd" -Content @"
@echo off
echo npx shim should not be reached
exit /b 0
"@

    $env:Path = "$shimDir;$originalPath"

    & powershell -NoProfile -ExecutionPolicy Bypass -File $installer -SkipBrowserInstall -SkipConnectivityCheck
    $installerExitCode = $LASTEXITCODE

    if ($installerExitCode -eq 0) {
        throw "Installer returned exit code 0 even though the npm shim failed."
    }

    if (-not (Test-Path -LiteralPath $statusFile)) {
        throw "Installer did not write status file: $statusFile"
    }

    $status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
    if ($status.status -ne "failed") {
        throw "Expected status=failed, got status=$($status.status)."
    }
    if ($status.step -ne "install-worker-dependencies") {
        throw "Expected failure at install-worker-dependencies, got step=$($status.step)."
    }

    Write-Host "Worker installer failure handling check passed."
    Write-Host "Installer exit code: $installerExitCode"
    Write-Host "Status file: $statusFile"
}
finally {
    $env:Path = $originalPath
    if (Test-Path -LiteralPath $shimDir) {
        Remove-Item -LiteralPath $shimDir -Recurse -Force
    }
}
