@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_from_config.ps1"
if errorlevel 1 (
  echo.
  echo Worker install failed. Check logs\worker-install.log
  pause
  exit /b 1
)
echo.
echo Worker install completed.
pause
