@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\share-cloudflare.ps1"
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
