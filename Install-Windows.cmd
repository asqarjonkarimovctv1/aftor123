@echo off
setlocal
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install.ps1" -EnableDebugMode
if errorlevel 1 (
  echo.
  echo Installation failed. Read the error above.
  pause
  exit /b 1
)
echo.
echo YT Timeline installed. Restart Premiere Pro.
pause
