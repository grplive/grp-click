@echo off
rem Installs GRP Click Receiver. Asks for administrator rights (needed for Program Files and the firewall).
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File ""%~dp0install.ps1""'"
pause
