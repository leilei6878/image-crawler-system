$ErrorActionPreference = "Stop"

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$startupFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupFolder "ImageCrawler-Worker.lnk"
$targetPath = Join-Path $packageRoot "02_start_worker.bat"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $packageRoot
$shortcut.WindowStyle = 1
$shortcut.Description = "Image Crawler Worker Autostart"
$shortcut.Save()

Write-Host "Autostart enabled: $shortcutPath"
