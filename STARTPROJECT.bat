@echo off
setlocal

REM Set default port or take from argument
set PORT=%1
if "%PORT%"=="" set PORT=8080

REM Launch PowerShell to serve the current directory
powershell -NoExit -Command "cd (Get-Location); .\Start-Server -Port %PORT%"

endlocal
