@echo off
setlocal

cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install_worker.ps1" %*

if errorlevel 1 (
  echo.
  echo Worker installation failed. Check logs\worker-install.log for details.
  if not defined WORKER_INSTALL_NO_PAUSE pause
  exit /b 1
)

echo.
echo Worker installation completed.
echo To start the worker manually:
echo   cd /d "%~dp0worker"
echo   npm start
echo.
if not defined WORKER_INSTALL_NO_PAUSE pause
exit /b 0
