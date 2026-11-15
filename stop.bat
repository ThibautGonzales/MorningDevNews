@echo off
rem Stops MorningDevNews. The data in data\ is kept.
cd /d "%~dp0"
docker compose down
timeout /t 3 >nul
