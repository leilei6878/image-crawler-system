param(
    [ValidateSet("start", "stop", "status")][string]$Action = "status",
    [int]$Port = 55432
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root "data\runtime\postgresql-16\pgsql\bin"
$dbDir = Join-Path $root "data\local-postgres"
$configFile = Join-Path $root "data\local-db.json"
$logs = Join-Path $root "logs"
if (-not (Test-Path -LiteralPath (Join-Path $bin "pg_ctl.exe"))) {
    throw "Extract PostgreSQL 16 binaries under data/runtime/postgresql-16 first."
}
function Invoke-DbCommand([string]$Name, [string[]]$Arguments) {
    & (Join-Path $bin $Name) @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}
if ($Action -eq "status") {
    & (Join-Path $bin "pg_ctl.exe") status -D $dbDir
    exit $LASTEXITCODE
}
if ($Action -eq "stop") {
    Invoke-DbCommand "pg_ctl.exe" @("stop", "-D", $dbDir, "-m", "fast", "-w")
    exit 0
}
New-Item -ItemType Directory -Path $logs -Force | Out-Null
if (-not (Test-Path -LiteralPath $configFile)) {
    if (Test-Path -LiteralPath $dbDir) { throw "Existing database directory has no local config; refusing initialization." }
    $randomBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($randomBytes)
    $rng.Dispose()
    $config = @{ host="127.0.0.1"; port=$Port; user="crawler_local"; password=[Convert]::ToBase64String($randomBytes); database="crawler_v1" }
    $config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding UTF8
}
$config = Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath (Join-Path $dbDir "PG_VERSION"))) {
    $passwordFile = Join-Path $root "data\initdb-password.tmp"
    try {
        [IO.File]::WriteAllText($passwordFile, $config.password)
        Invoke-DbCommand "initdb.exe" @("-D", $dbDir, "-U", $config.user, "--auth=scram-sha-256", "--pwfile=$passwordFile", "--encoding=UTF8", "--locale=C")
    } finally {
        if (Test-Path -LiteralPath $passwordFile) { Remove-Item -LiteralPath $passwordFile }
    }
}
& (Join-Path $bin "pg_ctl.exe") status -D $dbDir *> $null
if ($LASTEXITCODE -ne 0) {
    Invoke-DbCommand "pg_ctl.exe" @("start", "-D", $dbDir, "-l", (Join-Path $logs "local-postgres.log"), "-o", "-h 127.0.0.1 -p $($config.port)", "-w")
}
$previousPassword = $env:PGPASSWORD
try {
    $env:PGPASSWORD = $config.password
    $existing = & (Join-Path $bin "psql.exe") -h $config.host -p $config.port -U $config.user -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='crawler_v1'"
    if ($LASTEXITCODE -ne 0) { throw "Local PostgreSQL connection failed." }
    if ($existing -ne "1") {
        Invoke-DbCommand "createdb.exe" @("-h", $config.host, "-p", "$($config.port)", "-U", $config.user, "crawler_v1")
    }
} finally { $env:PGPASSWORD = $previousPassword }
Write-Host "Local PostgreSQL ready on 127.0.0.1:$($config.port). Credentials remain in ignored data/local-db.json."
