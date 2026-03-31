@echo off
chcp 65001 >nul
echo ============================================
echo   设置开机自启动
echo ============================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_DIR=%~dp0"

echo 正在创建开机自启快捷方式...

(
echo Set WshShell = CreateObject("WScript.Shell"^)
echo Set lnk = WshShell.CreateShortcut("%STARTUP_FOLDER%\ImageCrawler-Master.lnk"^)
echo lnk.TargetPath = "%SCRIPT_DIR%start_master.bat"
echo lnk.WorkingDirectory = "%SCRIPT_DIR%"
echo lnk.WindowStyle = 7
echo lnk.Description = "Image Crawler 主控端自启动"
echo lnk.Save
) > "%TEMP%\create_shortcut.vbs"

cscript //nologo "%TEMP%\create_shortcut.vbs"
del "%TEMP%\create_shortcut.vbs"

if exist "%STARTUP_FOLDER%\ImageCrawler-Master.lnk" (
    echo.
    echo 开机自启设置成功！
    echo 快捷方式位置: %STARTUP_FOLDER%\ImageCrawler-Master.lnk
    echo.
    echo 下次开机将自动启动主控端服务。
) else (
    echo.
    echo 设置失败，请手动操作：
    echo 1. 右键 start_master.bat，选择"创建快捷方式"
    echo 2. 按 Win+R，输入 shell:startup，回车
    echo 3. 把快捷方式拖到打开的文件夹里
)
echo.
pause
