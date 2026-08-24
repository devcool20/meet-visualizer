@echo off
title Stash Live - Standalone EXE Builder
color 0B

echo ==================================================================
echo              BUILDING STASH LIVE STANDALONE EXE
echo ==================================================================
echo.

cd /d "%~dp0\virtualcam-bridge"

echo Packaging StashLive into a portable executable...
pyinstaller --noconfirm --onedir --console --name "StashLive" ^
  --collect-all pyvirtualcam ^
  --collect-all speech_recognition ^
  app.py

echo.
echo ==================================================================
echo   BUILD FINISHED!
echo   Executable location: virtualcam-bridge\dist\StashLive\StashLive.exe
echo ==================================================================
echo.
pause
