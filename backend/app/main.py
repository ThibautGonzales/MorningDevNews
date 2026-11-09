"""Entry point of the MorningDevNews API.

Run from the backend/ folder: uvicorn app.main:app --reload
"""

from fastapi import FastAPI

app = FastAPI(title="MorningDevNews API")


@app.get("/api/health")
def health() -> dict:
    """Lets the frontend (and you) check that the backend is up."""
    return {"status": "ok"}
