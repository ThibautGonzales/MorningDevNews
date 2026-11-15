@echo off
rem Starts MorningDevNews with Docker Compose and opens it in the browser.
rem Needs Docker Desktop. The first start builds the images and takes a few minutes.
cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
  echo Docker was not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop
  pause
  exit /b 1
)

rem Docker Desktop may be installed but not running: start it and wait for the engine.
rem (gotos instead of a parenthesized block: labels and %%variables%% misbehave inside blocks.)
docker info >nul 2>nul
if not errorlevel 1 goto docker_ready
echo Starting Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set /a WAITED=0
:wait_docker
timeout /t 3 /nobreak >nul
docker info >nul 2>nul
if not errorlevel 1 goto docker_ready
set /a WAITED+=3
if %WAITED% lss 120 goto wait_docker
echo Docker did not start. Open Docker Desktop, wait until it is running, then run start.bat again.
pause
exit /b 1

:docker_ready

rem Data from the former start (database and API key in backend\) moves to data\ once.
if not exist data mkdir data
if exist backend\morningdevnews.db if not exist data\morningdevnews.db (
  echo Copying the existing database to data\...
  copy /y backend\morningdevnews.db data\morningdevnews.db >nul
)
if exist backend\.env if not exist data\.env (
  echo Copying the existing API key to data\...
  copy /y backend\.env data\.env >nul
)

rem --build rebuilds the images only when the code changed (after a git pull, for example).
echo Starting MorningDevNews...
docker compose up -d --build || goto :error

rem Wait until the frontend answers before opening the browser.
set /a WAITED=0
:wait_app
curl -s -o nul http://localhost:4200
if not errorlevel 1 goto app_ready
timeout /t 1 /nobreak >nul
set /a WAITED+=1
if %WAITED% lss 60 goto wait_app
:app_ready
start "" http://localhost:4200

echo MorningDevNews is running on http://localhost:4200
echo It keeps running after this window closes. Run stop.bat to stop it.
timeout /t 5 >nul
exit /b 0

:error
echo Start failed, see the messages above.
pause
exit /b 1
