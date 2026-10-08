@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
 echo Install Node.js 24 or newer, then run this file again.
 pause
 exit /b 1
)
set "OPEN_BROWSER=true"
node scripts\start.js
pause
