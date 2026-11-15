@echo off
rem Removes GRP Click Receiver. Your settings in %APPDATA%\GRP Click are kept.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0uninstall.ps1""'"
pause
