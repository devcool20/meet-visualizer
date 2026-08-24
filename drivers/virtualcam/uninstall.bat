@echo off
:: Stash Live Virtual Camera Uninstaller

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [Stash Live] Requesting Administrative privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo [Stash Live] Unregistering Stash Live Virtual Camera...
cd /d "%~dp0"
regsvr32.exe /s /u "%~dp0UnityCaptureFilter64.dll"
regsvr32.exe /s /u "%~dp0UnityCaptureFilter32.dll"

echo [Stash Live] Successfully unregistered Stash Live Virtual Camera.
pause
