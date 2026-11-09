# MorningDevNews

Application locale de veille technologique automatisée. Chaque matin, elle récupère
les articles publiés depuis la dernière exécution sur les flux RSS que tu as choisis,
et en fait un résumé avec un LLM.

## Structure

```
backend/    API Python (FastAPI) : collecte RSS, stockage SQLite, résumés LLM
frontend/   Interface Angular
```

## Prérequis

- Python 3.11 ou plus
- Node.js 20 ou plus

## Lancer en développement

Deux terminaux, un pour chaque partie.

**Backend** (depuis `backend/`) :

```bash
python -m venv .venv
# Windows (PowerShell / cmd) : .venv\Scripts\activate
# Windows (Git Bash)         : source .venv/Scripts/activate
# macOS / Linux              : source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Si le terminal affiche `(.venv)` au début de la ligne, l'environnement est bien activé.

L'API répond sur http://localhost:8000 (documentation auto sur http://localhost:8000/docs).

**Frontend** (depuis `frontend/`) :

```bash
npm install
npm start
```

Ouvre http://localhost:4200 : la page doit afficher « Backend : ok ».
Les appels `/api/...` du frontend sont redirigés vers le backend par `frontend/proxy.conf.json`.
