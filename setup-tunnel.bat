@echo off
title Cloudflare Tunnel Setup for CanVenient
echo ===================================================
echo     Launching Cloudflare Tunnel for Port 8000      
echo ===================================================
echo.

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] cloudflared CLI is not detected on your PC.
    echo.
    echo To install cloudflared using Windows Package Manager, run:
    echo   winget install --id Cloudflare.cloudflared
    echo.
    echo Or download the Windows binary directly from:
    echo   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
    echo.
    pause
    exit /b 1
)

echo [+] Launching free HTTPS tunnel to http://localhost:8000...
echo [+] Copy the 'https://...trycloudflare.com' URL displayed below into your Vercel VITE_API_BASE_URL setting!
echo.
cloudflared tunnel --url http://localhost:8000
