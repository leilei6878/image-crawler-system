@echo off
chcp 65001 >nul
echo 正在停止主控端服务...
taskkill /fi "WINDOWTITLE eq API Server*" /f >nul 2>&1
taskkill /fi "WINDOWTITLE eq Web Frontend*" /f >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /pid %%a /f >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do taskkill /pid %%a /f >nul 2>&1
echo 主控端已停止。
pause
