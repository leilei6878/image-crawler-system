$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workerDir = Join-Path $packageRoot "runtime\repo\image-crawler-system-codex-worker-installer\worker"
$envFile = Join-Path $workerDir ".env"

if (-not (Test-Path -LiteralPath $workerDir)) {
    throw "Worker directory was not found: $workerDir. Run 01_install_worker.bat first."
}

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "worker/.env was not found: $envFile. Run 01_install_worker.bat first."
}

Set-Location $workerDir
npm.cmd start
