param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$tempParent = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$testRoot = Join-Path $tempParent ("worker-installer-check-" + [Guid]::NewGuid().ToString("N"))
$originalPath = $env:Path
$originalScenario = $env:WORKER_INSTALL_TEST_FAILURE
$originalNoPause = $env:WORKER_INSTALL_NO_PAUSE

try {
    $scriptDir = New-Item -ItemType Directory -Path (Join-Path $testRoot "scripts") -Force
    $workerDir = New-Item -ItemType Directory -Path (Join-Path $testRoot "worker") -Force
    $shimDir = New-Item -ItemType Directory -Path (Join-Path $testRoot "shims") -Force
    Copy-Item -LiteralPath (Join-Path $repoRoot "scripts\install_worker.ps1") -Destination $scriptDir.FullName
    Copy-Item -LiteralPath (Join-Path $repoRoot "install_worker.bat") -Destination $testRoot
    Set-Content -LiteralPath (Join-Path $workerDir "package.json") -Value '{}' -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $shimDir "node.cmd") -Encoding ASCII -Value @'
@echo off
if "%~1"=="--version" (
  echo v20.0.0
  exit /b 0
)
if "%~1"=="--check" if "%WORKER_INSTALL_TEST_FAILURE%"=="preflight" exit /b 44
exit /b 0
'@
    Set-Content -LiteralPath (Join-Path $shimDir "npm.cmd") -Encoding ASCII -Value @'
@echo off
if "%~1"=="--version" (
  echo 10.0.0
  exit /b 0
)
if "%~1"=="install" if "%WORKER_INSTALL_TEST_FAILURE%"=="dependencies" exit /b 42
exit /b 0
'@
    Set-Content -LiteralPath (Join-Path $shimDir "npx.cmd") -Encoding ASCII -Value @'
@echo off
if "%WORKER_INSTALL_TEST_FAILURE%"=="playwright" exit /b 43
exit /b 0
'@
    $env:Path = "$($shimDir.FullName);$originalPath"
    $env:WORKER_INSTALL_NO_PAUSE = "1"
    $cases = @(
        @{ Name = "dependencies"; Step = "install-worker-dependencies"; NativeExit = 42 },
        @{ Name = "playwright"; Step = "install-browser"; NativeExit = 43 },
        @{ Name = "preflight"; Step = "validate-worker-code"; NativeExit = 44 }
    )
    foreach ($case in $cases) {
        $env:WORKER_INSTALL_TEST_FAILURE = $case.Name
        $caseLogs = Join-Path $testRoot $case.Name
        # Fresh per-case status paths prevent stale failed results from passing.
        $statusFile = Join-Path $caseLogs "worker-install-status.json"
        & (Join-Path $testRoot "install_worker.bat") -SkipConnectivityCheck -LogDirectory $caseLogs
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) { throw "$($case.Name): batch wrapper returned success." }
        if (-not (Test-Path -LiteralPath $statusFile)) { throw "$($case.Name): no fresh status file." }
        $status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
        if ($status.status -ne "failed" -or $status.step -ne $case.Step) {
            throw "$($case.Name): expected failed at $($case.Step), got $($status.status) at $($status.step)."
        }
        if ($status.message -notmatch "exit code $($case.NativeExit):") {
            throw "$($case.Name): failure did not originate from the injected native exit."
        }
        Write-Host "PASS $($case.Name): native exit $($case.NativeExit), status=failed, bat exit=$exitCode"
    }
}
finally {
    $env:Path = $originalPath
    $env:WORKER_INSTALL_TEST_FAILURE = $originalScenario
    $env:WORKER_INSTALL_NO_PAUSE = $originalNoPause
    $resolvedRoot = [IO.Path]::GetFullPath($testRoot)
    if (-not $resolvedRoot.StartsWith($tempParent + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to clean a path outside the temporary directory."
    }
    if (Test-Path -LiteralPath $resolvedRoot) { Remove-Item -LiteralPath $resolvedRoot -Recurse -Force }
}
