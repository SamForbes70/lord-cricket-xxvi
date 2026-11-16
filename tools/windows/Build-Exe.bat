@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-exe.ps1" -OutFile "%~dp0LordCricketXXVI.exe"
if errorlevel 1 (
  echo.
  echo Failed to build the native Windows launcher.
  pause
  exit /b 1
)
echo Launcher compiled. Double-click Play-Lord-Cricket.bat to play.
pause
