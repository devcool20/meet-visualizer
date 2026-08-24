@echo off
:: Stash Live 1-Click Virtual Camera Broadcaster Runner

echo ===================================================================
echo   🎥 STASH LIVE VIRTUAL CAMERA (DIRECT WEBCAM OVERLAY)
echo ===================================================================
echo Starting Virtual Camera Bridge at 60fps...
echo In Google Meet, select 'Stash Live Camera' under Settings -> Video -> Camera.
echo -------------------------------------------------------------------

cd /d "%~dp0..\virtualcam-bridge"
python app.py
pause
