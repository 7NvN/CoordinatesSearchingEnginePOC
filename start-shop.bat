@echo off
cd /d "%~dp0"
title Shopbook
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo Shopbook stopped.
pause
