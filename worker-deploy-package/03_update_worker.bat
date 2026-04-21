@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update_worker_from_github.ps1"
if errorlevel 1 (
  echo.
  echo Worker update failed. Check logs\worker-install.log
  pause
  exit /b 1
)
echo.
echo Worker update completed.
pause
