@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Lord Cricket XXVI
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\windows\launch-repo.ps1" %*
if errorlevel 1 (
  echo.
  echo Launch failed. Review the message above before closing.
  pause
  exit /b 1
)
exit /b 0
