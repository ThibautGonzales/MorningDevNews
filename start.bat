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

if not exist frontend\node_modules (
  echo Installing frontend dependencies...
  pushd frontend
  call npm install || goto :error
  popd
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
