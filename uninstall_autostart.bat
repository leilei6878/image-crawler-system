@echo off
chcp 65001 >nul
echo 正在移除开机自启...
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
del "%STARTUP_FOLDER%\ImageCrawler-Master.lnk" >nul 2>&1
echo 开机自启已移除。
pause
