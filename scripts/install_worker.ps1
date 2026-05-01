param(
    [string]$ServerUrl = "http://127.0.0.1:3000",
    [string]$HostKey = "local-worker-001",
    [string]$HostName = $env:COMPUTERNAME,
    [int]$MaxConcurrency = 1,
    [int]$PullIntervalMs = 5000,
    [switch]$ForceEnv,
    [switch]$InstallNodeIfMissing,
    [switch]$SkipBrowserInstall,
    [switch]$SkipConnectivityCheck,
    [switch]$StartWorker
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$workerDir = Join-Path $repoRoot "worker"
$logDir = Join-Path $repoRoot "logs"
$logFile = Join-Path $logDir "worker-install.log"
$statusFile = Join-Path $logDir "worker-install-status.json"
$envFile = Join-Path $workerDir ".env"

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

function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,
        [string[]]$ArgumentList = @(),
        [string]$WorkingDirectory,
        [switch]$PassThru
    )

    $displayCommand = $FilePath
    if ($ArgumentList.Count -gt 0) {
        $displayCommand = "$FilePath $($ArgumentList -join ' ')"
    }

    Write-InstallLog -Level "info" -Message "Running: $displayCommand"

    $previousLocation = Get-Location
    if ($WorkingDirectory) {
        Push-Location $WorkingDirectory
    }

    try {
        $global:LASTEXITCODE = 0
        if ($PassThru) {
            $output = & $FilePath @ArgumentList
            $exitCode = $LASTEXITCODE
            if ($null -eq $exitCode) {
                $exitCode = 0
            }
            if ($exitCode -ne 0) {
                throw "Native command failed with exit code ${exitCode}: $displayCommand"
            }
            return $output
        }

        & $FilePath @ArgumentList
        $exitCode = $LASTEXITCODE
        if ($null -eq $exitCode) {
            $exitCode = 0
        }
        if ($exitCode -ne 0) {
            throw "Native command failed with exit code ${exitCode}: $displayCommand"
        }
    }
    finally {
        if ($WorkingDirectory) {
            Set-Location $previousLocation
        }
    }
}

function Test-CommandExists {
    param([string]$Name)
    return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-NodeWithWinget {
    if (-not (Test-CommandExists "winget")) {
        throw "Node.js is missing and winget is not available. Install Node.js 20+ manually, then rerun this script."
    }

    Write-InstallLog -Level "info" -Message "Installing Node.js LTS with winget."
    Invoke-NativeCommand -FilePath "winget" -ArgumentList @(
        "install",
        "OpenJS.NodeJS.LTS",
        "--accept-package-agreements",
        "--accept-source-agreements"
    )

    $defaultNodePath = "C:\Program Files\nodejs"
    if (Test-Path -LiteralPath $defaultNodePath) {
        $env:Path = "$defaultNodePath;$env:Path"
    }
}

Ensure-Directory -Path $logDir
Set-Content -Path $logFile -Value ("Worker install started at {0}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"))
Write-InstallStatus -Step "init" -Status "running" -Message "worker installer initialized"

Invoke-Step -Name "validate-repository" -Action {
    if (-not (Test-Path -LiteralPath $workerDir)) {
        throw "Worker directory was not found: $workerDir"
    }
    if (-not (Test-Path -LiteralPath (Join-Path $workerDir "package.json"))) {
        throw "worker/package.json was not found."
    }
}

Invoke-Step -Name "check-node" -Action {
    if (-not (Test-CommandExists "node")) {
        if ($InstallNodeIfMissing) {
            Install-NodeWithWinget
        }
        else {
            throw "Node.js was not found. Install Node.js 20+ or rerun with -InstallNodeIfMissing."
        }
    }
    if (-not (Test-CommandExists "npm")) {
        throw "npm was not found. Reinstall Node.js 20+ and rerun this script."
    }

    $nodeVersion = (Invoke-NativeCommand -FilePath "node" -ArgumentList @("--version") -PassThru) -join "`n"
    $npmVersion = (Invoke-NativeCommand -FilePath "npm" -ArgumentList @("--version") -PassThru) -join "`n"
    Write-InstallLog -Level "info" -Message "node=$nodeVersion npm=$npmVersion"
}

Invoke-Step -Name "install-worker-dependencies" -Action {
    Invoke-NativeCommand -FilePath "npm" -ArgumentList @("install") -WorkingDirectory $workerDir
}

Invoke-Step -Name "install-browser" -Action {
    if ($SkipBrowserInstall) {
        Write-InstallLog -Level "info" -Message "Skipping Playwright browser install by request."
        return
    }

    Invoke-NativeCommand -FilePath "npx" -ArgumentList @("playwright", "install", "chromium") -WorkingDirectory $workerDir
}

Invoke-Step -Name "write-env" -Action {
    if ((Test-Path -LiteralPath $envFile) -and (-not $ForceEnv)) {
        Write-InstallLog -Level "info" -Message "worker/.env already exists. Keeping existing file. Use -ForceEnv to overwrite."
        return
    }

    $envContent = @"
SERVER_URL=$ServerUrl
HOST_KEY=$HostKey
HOST_NAME=$HostName
MAX_CONCURRENCY=$MaxConcurrency
PULL_INTERVAL_MS=$PullIntervalMs
SCREENSHOT_DIR=./screenshots
"@
    Set-Content -Path $envFile -Value $envContent -Encoding UTF8
}

Invoke-Step -Name "validate-worker-code" -Action {
    Invoke-NativeCommand -FilePath "node" -ArgumentList @("--check", "worker\src\index.js") -WorkingDirectory $repoRoot
    Invoke-NativeCommand -FilePath "node" -ArgumentList @("--check", "worker\src\browser\pool.js") -WorkingDirectory $repoRoot
}

Invoke-Step -Name "check-master-api" -Action {
    if ($SkipConnectivityCheck) {
        Write-InstallLog -Level "info" -Message "Skipping master API connectivity check by request."
        return
    }

    $healthUrl = $ServerUrl.TrimEnd("/") + "/api/health"
    $response = Invoke-WebRequest -UseBasicParsing -Uri $healthUrl -TimeoutSec 10
    if ($response.StatusCode -ne 200) {
        throw "Master API health check returned HTTP $($response.StatusCode)."
    }
    Write-InstallLog -Level "info" -Message "Master API is reachable: $healthUrl"
}

if ($StartWorker) {
    Invoke-Step -Name "start-worker" -Action {
        Invoke-NativeCommand -FilePath "npm" -ArgumentList @("--version") -WorkingDirectory $workerDir | Out-Null
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm start" -WorkingDirectory $workerDir
    }
}

Write-InstallStatus -Step "complete" -Status "ok" -Message "worker install completed"
Write-Host ""
Write-Host "Worker install completed."
Write-Host "Log:    $logFile"
Write-Host "Status: $statusFile"
Write-Host "Worker: $workerDir"
