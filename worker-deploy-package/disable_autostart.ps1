$ErrorActionPreference = "Stop"

$startupFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupFolder "ImageCrawler-Worker.lnk"

if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
    Write-Host "Autostart removed: $shortcutPath"
} else {
    Write-Host "Autostart shortcut not found."
}
