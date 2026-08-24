# Stash Live Virtual Camera PowerShell Registration Helper
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[Stash Live] Requesting elevated Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$dll64 = Join-Path $scriptDir "UnityCaptureFilter64.dll"
$dll32 = Join-Path $scriptDir "UnityCaptureFilter32.dll"

Write-Host "[Stash Live] Registering 64-bit filter: $dll64" -ForegroundColor Cyan
Start-Process "regsvr32.exe" -ArgumentList "/s /n /i:UnityCaptureName=`"Stash Live Camera`" `"$dll64`"" -Wait

if (Test-Path $dll32) {
    Write-Host "[Stash Live] Registering 32-bit filter: $dll32" -ForegroundColor Cyan
    Start-Process "regsvr32.exe" -ArgumentList "/s /n /i:UnityCaptureName=`"Stash Live Camera`" `"$dll32`"" -Wait
}

Write-Host "[Stash Live] Successfully registered 'Stash Live Camera'!" -ForegroundColor Green
Write-Host "You can now select 'Stash Live Camera' in Google Meet, Zoom, and Teams." -ForegroundColor Green
Start-Sleep -Seconds 3
