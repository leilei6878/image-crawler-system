@echo off
chcp 65001 >nul
title Image Crawler - 主控端
echo ============================================
echo   分布式图片采集系统 - 主控端启动
echo ============================================
echo.

cd /d "%~dp0"

echo [1/3] 检查依赖...
if not exist "server\node_modules" (
    echo 正在安装 server 依赖...
    cd server
    npm install
    npm install mysql2 dotenv
    cd ..
)
if not exist "web\node_modules" (
    echo 正在安装 web 依赖...
    cd web
    npm install
    cd ..
)
echo 依赖检查完成。
echo.

echo [2/3] 启动API服务器...
start "API Server" /min cmd /c "cd /d %~dp0server && node src\index.js"
timeout /t 3 /nobreak >nul
echo API服务器已启动 (端口 3000)
echo.

echo [3/3] 启动Web前端...
start "Web Frontend" /min cmd /c "cd /d %~dp0web && npx vite --port 5000 --host"
timeout /t 3 /nobreak >nul
echo Web前端已启动 (端口 5000)
echo.

echo ============================================
echo   主控端启动完成！
echo   管理界面: http://localhost:5000
echo   API地址:  http://localhost:3000
echo ============================================
echo.
echo 按任意键打开管理界面...
pause >nul
start http://localhost:5000
