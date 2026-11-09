"""Point d'entrée de l'API MorningDevNews.

Lancement (depuis le dossier backend/) : uvicorn app.main:app --reload
"""

from fastapi import FastAPI

app = FastAPI(title="MorningDevNews API")


@app.get("/api/health")
def health() -> dict:
    """Permet au frontend (et à toi) de vérifier que le backend répond."""
    return {"status": "ok"}
