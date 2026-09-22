param(
    [ValidateSet("start", "stop", "status")][string]$Action = "status",
    [int]$Port = 3100,
    [switch]$AllowLocalTestTargets
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$stateFile = Join-Path $root "data\local-processes.json"
$logs = Join-Path $root "logs"
function Get-OwnedProcess($entry) {
    $process = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
    if ($process -and $process.StartTime.ToUniversalTime().ToString("o") -eq $entry.startedAt -and
        $process.Path -eq $entry.executable) { return $process }
    return $null
}
if ($Action -eq "status" -or $Action -eq "stop") {
    if (-not (Test-Path -LiteralPath $stateFile)) { Write-Host "No recorded crawler processes."; exit 0 }
    $state = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    foreach ($entry in $state.processes) {
        $process = Get-OwnedProcess $entry
        if ($Action -eq "stop" -and $process) { Stop-Process -InputObject $process }
        Write-Host "$($entry.name): $(if ($process) { $Action } else { 'not running' })"
    }
    if ($Action -eq "status") {
        Invoke-RestMethod -Uri "http://127.0.0.1:$($state.port)/api/health" -TimeoutSec 3 | ConvertTo-Json
    }
    exit 0
}
if (Test-Path -LiteralPath $stateFile) {
    $existing = Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json
    if (@($existing.processes | Where-Object { Get-OwnedProcess $_ }).Count -gt 0) {
        throw "Recorded crawler processes are already running; use status or stop first."
    }
}
$probe = New-Object Net.Sockets.TcpClient
try {
    try { $probe.Connect("127.0.0.1", $Port) } catch { }
    if ($probe.Connected) { throw "Port $Port is already occupied; choose another -Port." }
} finally { $probe.Dispose() }
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$node = (Get-Command node.exe).Source
$oldPort = $env:PORT
$oldServer = $env:SERVER_URL
$oldAllowLocal = $env:ALLOW_LOCAL_CRAWL_TARGETS
$started = @()
try {
    $env:PORT = "$Port"
    $env:SERVER_URL = "http://127.0.0.1:$Port"
    $env:ALLOW_LOCAL_CRAWL_TARGETS = if ($AllowLocalTestTargets) { "true" } else { "false" }
    foreach ($entry in @(
        @{ Name="server"; Script="server\scripts\local-server.cjs"; Cwd="server" },
        @{ Name="worker"; Script="worker\src\local-worker.js"; Cwd="worker" }
    )) {
        $scriptFile = Join-Path $root $entry.Script
        $process = Start-Process -FilePath $node -ArgumentList ('"' + $scriptFile + '"') -WorkingDirectory (Join-Path $root $entry.Cwd) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs ($entry.Name + ".out.log")) -RedirectStandardError (Join-Path $logs ($entry.Name + ".error.log"))
        $started += @{ name=$entry.Name; id=$process.Id; startedAt=$process.StartTime.ToUniversalTime().ToString("o"); executable=$node }
        if ($entry.Name -eq "server") {
            $healthy = $false
            for ($attempt=0; $attempt -lt 30; $attempt++) {
                if ($process.HasExited) { throw "Crawler API exited; inspect logs/server.error.log." }
                try {
                    $health = Invoke-RestMethod -Uri "$($env:SERVER_URL)/api/health" -TimeoutSec 1
                    if ($health.app -eq "image-crawler-system" -and $health.status -eq "ok") { $healthy=$true; break }
                } catch { }
                Start-Sleep -Milliseconds 200
            }
            if (-not $healthy) { throw "Crawler API did not become healthy." }
        }
    }
    @{ port=$Port; processes=$started } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $stateFile -Encoding UTF8
    Write-Host "Crawler: http://127.0.0.1:$Port/social"
    Write-Host "Management credential: ignored data/local-auth.json (adminToken)"
} catch {
    foreach ($entry in $started) {
        $process = Get-OwnedProcess $entry
        if ($process) { Stop-Process -InputObject $process }
    }
    throw
} finally {
    $env:PORT=$oldPort
    $env:SERVER_URL=$oldServer
    $env:ALLOW_LOCAL_CRAWL_TARGETS=$oldAllowLocal
}
