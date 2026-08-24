@echo off
:: Stash Live Virtual Camera 64-bit DirectShow Filter Installer
:: Must be run as Administrator

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [Stash Live] Requesting Administrative privileges to register Virtual Camera filter...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo [Stash Live] Registering Stash Live Virtual Camera DirectShow Filter (64-bit)...
cd /d "%~dp0"
regsvr32.exe /s /n /i:UnityCaptureName="Stash Live Camera" "%~dp0UnityCaptureFilter64.dll"
regsvr32.exe /s /n /i:UnityCaptureName="Stash Live Camera" "%~dp0UnityCaptureFilter32.dll"

echo [Stash Live] Successfully registered "Stash Live Camera"!
echo [Stash Live] The camera is now available in Google Meet, Zoom, and all Windows applications.
pause
