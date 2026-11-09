# MorningDevNews

Local, automated tech watch app. Every morning it fetches the articles published since
the last run on the RSS feeds you picked, and summarizes them with an LLM.

## Structure

```
backend/    Python API (FastAPI): RSS collection, SQLite storage, LLM summaries
frontend/   Angular interface
start.bat   Starts everything on Windows
```

## Requirements

- Python 3.11 or newer
- Node.js 24.15 or newer (required by Angular 22)

## Quick start (Windows)

Double-click `start.bat` (or run it from a terminal). It:

1. creates the Python virtual environment `backend/.venv` and installs the backend dependencies,
2. installs the frontend dependencies if `frontend/node_modules` is missing,
3. opens two windows, one for the backend and one for the frontend, and opens http://localhost:4200.

Close the two windows to stop the app. If you change `frontend/package.json`, run
`npm install` in `frontend/` (the script only installs when `node_modules` is missing).

## Manual start (any OS)

Two terminals, one per part.

**Backend** (from `backend/`):

```bash
python -m venv .venv
# Windows (PowerShell / cmd): .venv\Scripts\activate
# Windows (Git Bash)        : source .venv/Scripts/activate
# macOS / Linux             : source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

When the prompt starts with `(.venv)`, the environment is active.

The API answers on http://localhost:8000 (auto-generated docs at http://localhost:8000/docs).

On the first start the backend creates the SQLite database `backend/morningdevnews.db`
(ignored by Git) and inserts two example topics. Delete the file to start again from scratch.

**Frontend** (from `frontend/`):

```bash
npm install
npm start
```

Open http://localhost:4200: the page should show "Backend: ok".
`/api/...` calls from the frontend are forwarded to the backend by `frontend/proxy.conf.json`.

## Languages

The project is written in English (code, comments, docs). The interface is in English by
default and can be switched to French with the selector at the top of the page; the choice
is remembered by the browser. Texts live in `frontend/src/app/core/i18n/translations.ts`:
to add a text, add its key to `en` and to `fr` (TypeScript reports a missing translation).
