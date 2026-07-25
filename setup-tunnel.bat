@echo off
title Cloudflare Tunnel Setup for CanVenient
echo ===================================================
echo     Launching Cloudflare Tunnel for Port 8000      
echo ===================================================
echo.

set "CLOUDFLARED_BIN=cloudflared"

where cloudflared >nul 2>nul
if %errorlevel% equ 0 goto FOUND

if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
    set "CLOUDFLARED_BIN=C:\Program Files (x86)\cloudflared\cloudflared.exe"
    goto FOUND
)
if exist "C:\Program Files\cloudflared\cloudflared.exe" (
    set "CLOUDFLARED_BIN=C:\Program Files\cloudflared\cloudflared.exe"
    goto FOUND
)

echo [!] cloudflared CLI is not detected on your PC.
echo.
echo To install cloudflared using Windows Package Manager, run:
echo   winget install --id Cloudflare.cloudflared
echo.
pause
exit /b 1

:FOUND
echo [+] Launching free HTTPS tunnel to http://localhost:8000...
echo [+] Copy the 'https://...trycloudflare.com' URL displayed below into your Vercel VITE_API_BASE_URL setting!
echo.
"%CLOUDFLARED_BIN%" tunnel --url http://localhost:8000
