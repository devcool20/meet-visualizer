@echo off
title Stash Live - All Servers Launcher
color 0A

echo ==================================================================
echo              STARTING ALL STASH LIVE SERVERS
echo ==================================================================
echo.

cd /d "%~dp0"

echo [1/3] Starting Stash Live Backend Engine (Port 5000)...
start "Stash Live Engine" cmd /k "cd engine && npm run dev"

echo [2/3] Starting Stash Live Frontend Web Dashboard (Port 5173)...
start "Stash Live Frontend" cmd /k "npm run dev"

echo [3/3] Starting Stash Live 720p HD Virtual Camera Stream...
start "Stash Live Virtual Camera" cmd /k "python -u virtualcam-bridge/app.py"

echo.
echo ==================================================================
echo   ALL SERVERS STARTED SUCCESSFULLY!
echo ==================================================================
echo   - Backend Engine:      http://localhost:5000
echo   - Web Dashboard:       http://localhost:5173/virtualcam
echo   - Virtual Camera:      Broadcasting to 'OBS Virtual Camera'
echo.
echo   In Google Meet: Select 'OBS Virtual Camera' under Video Settings.
echo ==================================================================
echo.
pause
