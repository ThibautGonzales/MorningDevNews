"""Entry point of the MorningDevNews API.

Run from the backend/ folder: uvicorn app.main:app --reload
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.articles import TopicArticles, relevant_articles_by_topic
from app.collector import run_collection
from app.database import create_db_and_tables, get_session
from app.llm import (
    PROVIDERS,
    effective_model,
    get_chat_model,
    get_settings,
    guess_provider,
    read_api_key,
    save_api_key,
)
from app.models import LlmSettings, Run, Topic
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


@app.post("/api/runs")
def start_run(session: Session = Depends(get_session)) -> Run:
    """Collects all enabled sources now and returns the finished run.

    The request waits until every feed is read (a few seconds). A plain "def" endpoint
    runs in a worker thread, so the server keeps answering other requests meanwhile.
    """
    return run_collection(session)


@app.get("/api/articles/relevant")
def list_relevant_articles(session: Session = Depends(get_session)) -> list[TopicArticles]:
    """The relevant articles of the last 7 days, grouped by topic."""
    return relevant_articles_by_topic(session)


# ---------- LLM settings ----------


class SettingsIn(BaseModel):
    """What the settings form sends. A missing field is left unchanged."""

    provider: str | None = None
    model: str | None = None
    api_key: str | None = None


def public_settings(settings: LlmSettings) -> dict:
    """The settings as the frontend sees them: only the last 4 characters of the key."""
    key = read_api_key() or ""
    return {
        "provider": settings.provider,
        "model": effective_model(settings),
        "api_key_hint": f"…{key[-4:]}" if key else None,
        "providers": [
            {"id": provider_id, "label": p["label"], "default_model": p["default_model"]}
            for provider_id, p in PROVIDERS.items()
        ],
    }


@app.get("/api/settings")
def read_settings(session: Session = Depends(get_session)) -> dict:
    return public_settings(get_settings(session))


@app.put("/api/settings")
def update_settings(body: SettingsIn, session: Session = Depends(get_session)) -> dict:
    """Saves the fields that were sent. Changing provider resets the model to its default."""
    settings = get_settings(session)
    if body.api_key:
        api_key = body.api_key.strip()
        save_api_key(api_key)
        if not body.provider:
            settings.provider = guess_provider(api_key) or settings.provider
    if body.provider:
        if body.provider not in PROVIDERS:
            raise HTTPException(400, "Unknown provider")
        if body.provider != settings.provider:
            settings.model = None  # the old model name means nothing for another provider
        settings.provider = body.provider
    if body.model is not None:
        settings.model = body.model.strip() or None
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return public_settings(settings)


@app.post("/api/settings/test")
def test_settings(session: Session = Depends(get_session)) -> dict:
    """Sends a tiny prompt to check that the provider, model and key work together."""
    try:
        get_chat_model(get_settings(session)).invoke("Just reply OK.")
    except Exception as exc:  # any provider error (bad key, unknown model, quota) is shown as is
        raise HTTPException(400, f"Could not connect to the model: {exc}") from exc
    return {"status": "ok"}
