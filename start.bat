@echo off
rem Starts MorningDevNews on Windows: backend and frontend each run in their own window.
rem The first run creates the Python virtual environment and installs the dependencies.
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python was not found. Install Python 3.11 or newer from https://www.python.org
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 24.15 or newer from https://nodejs.org
  pause
  exit /b 1
)

if not exist backend\.venv (
  echo Creating the Python virtual environment...
  python -m venv backend\.venv || goto :error
)
echo Installing backend dependencies...
backend\.venv\Scripts\python -m pip install --quiet --disable-pip-version-check -r backend\requirements.txt || goto :error

rem npm install runs on the first start and again whenever package-lock.json changed
rem (new dependency after a git pull): a copy of the lock file is kept next to the packages.
set "LOCK_COPY=frontend\node_modules\.morningdevnews-lock.json"
set "INSTALL_FRONTEND=0"
if not exist "%LOCK_COPY%" set "INSTALL_FRONTEND=1"
if exist "%LOCK_COPY%" (
  fc /b frontend\package-lock.json "%LOCK_COPY%" >nul 2>nul
  if errorlevel 1 set "INSTALL_FRONTEND=1"
)
if "%INSTALL_FRONTEND%"=="1" (
  echo Installing frontend dependencies...
  pushd frontend
  call npm install || goto :error
  popd
  copy /y frontend\package-lock.json "%LOCK_COPY%" >nul
)

start "MorningDevNews - backend" /d backend cmd /k .venv\Scripts\python -m uvicorn app.main:app --reload
start "MorningDevNews - frontend" /d frontend cmd /k npm start -- --open

echo Backend: http://localhost:8000  -  Frontend: http://localhost:4200 (opens in your browser)
echo Close the two windows to stop the application.
exit /b 0

:error
echo Setup failed, see the messages above.
pause
exit /b 1
