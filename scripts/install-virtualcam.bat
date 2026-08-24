@echo off
:: Stash Live 1-Click Virtual Camera Driver Installer

echo ===================================================================
echo   [Stash Live] Installing DirectShow Virtual Camera Driver...
echo ===================================================================

cd /d "%~dp0..\drivers\virtualcam"
call install.bat
