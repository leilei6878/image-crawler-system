@echo off
chcp 65001 >nul
title Image Crawler - 被控端Worker
echo ============================================
echo   分布式图片采集系统 - 被控端启动
echo ============================================
echo.

cd /d "%~dp0"

echo [1/2] 检查依赖...
if not exist "worker\node_modules" (
    echo 正在安装 worker 依赖...
    cd worker
    npm install
    npm install dotenv
    npx playwright install chromium
    cd ..
)
echo 依赖检查完成。
echo.

echo [2/2] 启动Worker...
cd worker
node src\index.js
