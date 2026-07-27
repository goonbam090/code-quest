@echo off
setlocal
cd /d "%~dp0"

where powershell.exe >nul 2>&1
if not errorlevel 1 goto run_windows_powershell

where pwsh.exe >nul 2>&1
if not errorlevel 1 goto run_powershell

echo.
echo [Code Quest] PowerShell was not found. Install PowerShell or use a supported Windows installation.
if "%CODE_QUEST_NO_PAUSE%"=="1" exit /b 1
pause
exit /b 1

:run_windows_powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
goto check_result

:run_powershell
pwsh.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"

:check_result
set "CODE_QUEST_EXIT_CODE=%ERRORLEVEL%"
if "%CODE_QUEST_EXIT_CODE%"=="0" exit /b 0
if "%CODE_QUEST_NO_PAUSE%"=="1" exit /b %CODE_QUEST_EXIT_CODE%

echo.
echo [Code Quest] Startup failed. Review the message above, then press any key to close this window.
pause >nul
exit /b %CODE_QUEST_EXIT_CODE%
