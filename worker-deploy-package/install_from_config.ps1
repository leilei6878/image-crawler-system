$ErrorActionPreference = "Stop"
$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

. (Join-Path $packageRoot "worker_install_config.ps1")

& (Join-Path $packageRoot "install_worker_from_github.ps1") `
  -ServerUrl $ServerUrl `
  -HostKey $HostKey `
  -HostName $HostName `
  -MaxConcurrency $MaxConcurrency `
  -PullIntervalMs $PullIntervalMs `
  -Branch $Branch `
  -InstallNodeIfMissing:([bool]$InstallNodeIfMissing) `
  -SkipBrowserInstall:([bool]$SkipBrowserInstall) `
  -StartWorker:([bool]$StartWorkerAfterInstall)
