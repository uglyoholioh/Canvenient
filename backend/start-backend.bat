@echo off
title CanVenient Backend Production Server
echo ==========================================
echo       Starting CanVenient Backend         
echo ==========================================
echo.

cd /d "%~dp0"
call venv\Scripts\activate.bat
uvicorn main:app --host 0.0.0.0 --port 8000
