@echo off
title Stash Live - Standalone EXE Builder
color 0B

echo ==================================================================
echo              BUILDING STASH LIVE STANDALONE EXE
echo ==================================================================
echo.

cd /d "%~dp0\virtualcam-bridge"

echo Packaging StashLive into a portable executable (fast build)...
pyinstaller --noconfirm StashLive.spec

echo.
echo ==================================================================
echo   BUILD FINISHED!
echo   Executable location: virtualcam-bridge\dist\StashLive\StashLive.exe
echo ==================================================================
echo.
pause
