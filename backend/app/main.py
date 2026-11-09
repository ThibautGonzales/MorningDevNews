"""Entry point of the MorningDevNews API.

Run from the backend/ folder: uvicorn app.main:app --reload
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from sqlmodel import Session, select

from app.database import create_db_and_tables, get_session
from app.models import Topic
from app.seed import seed_example_topics


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Runs once when the server starts: prepares the database."""
    create_db_and_tables()
    seed_example_topics()
    yield


app = FastAPI(title="MorningDevNews API", lifespan=lifespan)


@app.get("/api/health")
def health() -> dict:
    """Lets the frontend (and you) check that the backend is up."""
    return {"status": "ok"}


@app.get("/api/topics")
def list_topics(session: Session = Depends(get_session)) -> list[Topic]:
    """Temporary read-only endpoint to check the seeded data in /docs."""
    return list(session.exec(select(Topic)))
