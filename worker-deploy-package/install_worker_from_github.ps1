param(
    [string]$ServerUrl = "http://127.0.0.1:3000",
    [string]$HostKey = "worker-001",
    [string]$HostName = $env:COMPUTERNAME,
    [int]$MaxConcurrency = 5,
    [int]$PullIntervalMs = 5000,
    [string]$Branch = "codex/worker-installer",
    [switch]$InstallNodeIfMissing,
    [switch]$SkipBrowserInstall,
    [switch]$StartWorker
)

$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $packageRoot "runtime"
$repoExtractRoot = Join-Path $runtimeRoot "repo"
$repoRoot = Join-Path $repoExtractRoot "image-crawler-system-codex-worker-installer"
$workerDir = Join-Path $repoRoot "worker"
$backupRoot = Join-Path $runtimeRoot "backup"
$logsDir = Join-Path $packageRoot "logs"
$logFile = Join-Path $logsDir "worker-install.log"
$statusFile = Join-Path $logsDir "worker-install-status.json"
$zipPath = Join-Path $runtimeRoot "image-crawler-system-worker.zip"
$cookiesBackupDir = Join-Path $backupRoot "cookies"

function Ensure-Directory {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Write-InstallLog {
    param(
        [string]$Level,
        [string]$Message
    )
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    Write-Host $line
    Add-Content -Path $logFile -Value $line
}

function Write-InstallStatus {
    param(
        [string]$Step,
        [string]$Status,
        [string]$Message
    )
    $payload = [ordered]@{
        timestamp = (Get-Date).ToString("o")
        step = $Step
        status = $Status
        message = $Message
        server_url = $ServerUrl
        repo_root = $repoRoot
        worker_dir = $workerDir
        log_file = $logFile
    }
    $payload | ConvertTo-Json | Set-Content -Path $statusFile -Encoding UTF8
    Write-InstallLog -Level $Status -Message "$Step - $Message"
}

function Invoke-Step {
    param(
        [string]$Name,
        [scriptblock]$Action
    )
    Write-InstallStatus -Step $Name -Status "running" -Message "started"
    try {
        & $Action
        Write-InstallStatus -Step $Name -Status "ok" -Message "completed"
    }
    catch {
        Write-InstallStatus -Step $Name -Status "failed" -Message $_.Exception.Message
        throw
    }
}

function Test-CommandExists {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-NodeWithWinget {
    if (-not (Test-CommandExists "winget")) {
        throw "Node.js is missing and winget is not available. Install Node.js 20+ manually and rerun."
    }

    Write-InstallLog -Level "info" -Message "Installing Node.js LTS with winget."
    winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements

    $defaultNodePath = "C:\Program Files\nodejs"
    if (Test-Path -LiteralPath $defaultNodePath) {
        $env:Path = "$defaultNodePath;$env:Path"
    }
}

function Remove-DirectorySafe {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    if (-not $resolved.StartsWith($runtimeRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to remove path outside runtime root: $resolved"
    }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}

function Backup-Cookies {
    $existingCookiesDir = Join-Path $workerDir "cookies"
    if (-not (Test-Path -LiteralPath $existingCookiesDir)) { return }

    Remove-DirectorySafe -Path $cookiesBackupDir
    Ensure-Directory -Path $backupRoot
    Copy-Item -Path $existingCookiesDir -Destination $cookiesBackupDir -Recurse -Force
}

function Restore-Cookies {
    Ensure-Directory -Path (Join-Path $workerDir "cookies")
    if (-not (Test-Path -LiteralPath $cookiesBackupDir)) { return }
    Copy-Item -Path (Join-Path $cookiesBackupDir "*") -Destination (Join-Path $workerDir "cookies") -Recurse -Force
}

Ensure-Directory -Path $runtimeRoot
Ensure-Directory -Path $logsDir
Set-Content -Path $logFile -Value ("Worker package install started at {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-InstallStatus -Step "init" -Status "running" -Message "worker package initialized"

Invoke-Step -Name "check-node" -Action {
    if (-not (Test-CommandExists "node")) {
        if ($InstallNodeIfMissing) {
            Install-NodeWithWinget
        }
        else {
            throw "Node.js was not found. Install Node.js 20+ or enable InstallNodeIfMissing."
        }
    }
    if (-not (Test-CommandExists "npm")) {
        throw "npm was not found. Reinstall Node.js 20+ and rerun."
    }

    $nodeVersion = (& node --version)
    $npmVersion = (& npm --version)
    Write-InstallLog -Level "info" -Message "node=$nodeVersion npm=$npmVersion"
}

Invoke-Step -Name "download-repo" -Action {
    Backup-Cookies
    $archiveUrl = "https://github.com/leilei6878/image-crawler-system/archive/refs/heads/$Branch.zip"
    Write-InstallLog -Level "info" -Message "Downloading $archiveUrl"
    Invoke-WebRequest -UseBasicParsing -Uri $archiveUrl -OutFile $zipPath
}

Invoke-Step -Name "extract-repo" -Action {
    Remove-DirectorySafe -Path $repoExtractRoot
    Ensure-Directory -Path $repoExtractRoot
    Expand-Archive -Path $zipPath -DestinationPath $repoExtractRoot -Force
    if (-not (Test-Path -LiteralPath $workerDir)) {
        throw "worker directory was not found after extract: $workerDir"
    }
}

Invoke-Step -Name "write-env" -Action {
    $envContent = @"
SERVER_URL=$ServerUrl
HOST_KEY=$HostKey
HOST_NAME=$HostName
MAX_CONCURRENCY=$MaxConcurrency
PULL_INTERVAL_MS=$PullIntervalMs
SCREENSHOT_DIR=./screenshots
"@
    Set-Content -Path (Join-Path $workerDir ".env") -Value $envContent -Encoding UTF8
    Ensure-Directory -Path (Join-Path $workerDir "screenshots")
}

Invoke-Step -Name "restore-cookies" -Action {
    Restore-Cookies
}

Invoke-Step -Name "install-worker-dependencies" -Action {
    Push-Location $workerDir
    try {
        npm.cmd install
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Name "install-browser" -Action {
    if ($SkipBrowserInstall) {
        Write-InstallLog -Level "info" -Message "Skipping Playwright browser install by request."
        return
    }
    Push-Location $workerDir
    try {
        npx playwright install chromium
    }
    finally {
        Pop-Location
    }
}

Invoke-Step -Name "validate-connectivity" -Action {
    $healthUrl = $ServerUrl.TrimEnd("/") + "/api/health"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 10
    if ($response.StatusCode -ne 200) {
        throw "Master API health check returned HTTP $($response.StatusCode)."
    }
    Write-InstallLog -Level "info" -Message "Master API reachable: $healthUrl"
}

if ($StartWorker) {
    Invoke-Step -Name "start-worker" -Action {
        Start-Process -FilePath "powershell.exe" -WorkingDirectory $workerDir -ArgumentList @(
            "-NoExit",
            "-Command",
            "npm.cmd start"
        )
    }
}

Write-InstallStatus -Step "complete" -Status "ok" -Message "worker install completed"
Write-Host ""
Write-Host "Worker install completed."
Write-Host "Repo:   $repoRoot"
Write-Host "Worker: $workerDir"
Write-Host "Log:    $logFile"
Write-Host "Status: $statusFile"
