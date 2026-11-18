@echo off
rem Pembungkus: klik dua kali atau jalankan  .\deploy.cmd [opsi]  (tidak terhalang kebijakan eksekusi PowerShell).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
echo.
pause
