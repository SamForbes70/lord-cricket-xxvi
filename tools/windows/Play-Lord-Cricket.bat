@echo off
setlocal
cd /d "%~dp0"
if exist "LordCricketXXVI.exe" (
  start "" "%~dp0LordCricketXXVI.exe"
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-windows.ps1"
if errorlevel 1 (
  echo.
  echo Unable to start Lord Cricket XXVI. Check the error above.
  pause
  exit /b 1
)
