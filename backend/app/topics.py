"""Topic settings: the API behind the Topic settings page.

A topic is what the brief is organized by ("AI / LLM"). Its description holds the filtering
instructions read by the relevance judge and the summarizers. Each topic has its sources,
the sites whose RSS/Atom feed the collection reads.

Nothing is deleted except a source that never brought an article: a topic or a source you
no longer want is disabled, so the articles and summaries it produced stay in the history.
"""

from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, func, select

from app.database import get_session
from app.feeds import discover_feed_url, fetch_feed
from app.models import Article, Source, Topic

router = APIRouter(prefix="/api")


# ---------- What the API receives and returns ----------


class TopicIn(BaseModel):
    """What the form sends to create a topic."""

    name: str
    description: str


class TopicUpdate(BaseModel):
    """What the form sends to change a topic. A missing field is left unchanged."""

    name: str | None = None
    description: str | None = None
    enabled: bool | None = None


class SourceIn(BaseModel):
    """What the form sends to add a source. Without feed_url, it is looked for on the site."""

    name: str
    site_url: str
    feed_url: str | None = None


class SourceUpdate(BaseModel):
    """What the form sends to change a source. A missing field is left unchanged."""

    name: str | None = None
    site_url: str | None = None
    feed_url: str | None = None
    enabled: bool | None = None


class SourceOut(BaseModel):
    id: int
    name: str
    site_url: str
    feed_url: str | None
    enabled: bool
    last_fetched_at: datetime | None
    # Only a source without articles can be deleted, so the page needs the count.
    article_count: int


class TopicOut(BaseModel):
    id: int
    name: str
    description: str
    enabled: bool
    sources: list[SourceOut]


# ---------- Helpers ----------


def required_text(value: str, field: str) -> str:
    """Trims a text field and refuses it when empty."""
    value = value.strip()
    if not value:
        raise HTTPException(400, f"The {field} cannot be empty.")
    return value


def check_name_is_free(session: Session, name: str, topic_id: int | None = None) -> None:
    """Topic names are unique: refuses a name already used by another topic."""
    other = session.exec(select(Topic).where(Topic.name == name)).first()
    if other is not None and other.id != topic_id:
        raise HTTPException(409, f'A topic named "{name}" already exists.')


def checked_feed_url(site_url: str, feed_url: str | None) -> str:
    """Returns a feed URL that really works, found on the site when none is given.

    The feed is downloaded once here, so a wrong URL is reported in the form rather
    than at the next collection.
    """
    if not feed_url:
        try:
            feed_url = discover_feed_url(site_url)
        except httpx.HTTPError as exc:
            raise HTTPException(400, f"Could not open {site_url}: {exc}") from exc
        if not feed_url:
            raise HTTPException(
                400,
                f"No RSS/Atom feed is advertised on {site_url}. Enter the feed URL yourself.",
            )
    try:
        entries = fetch_feed(feed_url)
    except httpx.HTTPError as exc:
        raise HTTPException(400, f"Could not read the feed {feed_url}: {exc}") from exc
    # feedparser reads any page without error: a HTML page simply gives no item.
    if not entries:
        raise HTTPException(400, f"No article found at {feed_url}: is it a RSS/Atom feed?")
    return feed_url


def article_counts(session: Session) -> dict[int, int]:
    """The number of stored articles of every source, in one query."""
    rows = session.exec(select(Article.source_id, func.count()).group_by(Article.source_id))
    return dict(rows.all())


def source_out(source: Source, counts: dict[int, int]) -> SourceOut:
    return SourceOut(**source.model_dump(exclude={"topic_id"}), article_count=counts.get(source.id, 0))


def topic_out(session: Session, topic: Topic, counts: dict[int, int] | None = None) -> TopicOut:
    if counts is None:
        counts = article_counts(session)
    sources = session.exec(select(Source).where(Source.topic_id == topic.id).order_by(Source.id))
    return TopicOut(
        id=topic.id,
        name=topic.name,
        description=topic.description,
        enabled=topic.enabled,
        sources=[source_out(s, counts) for s in sources],
    )


def get_topic(session: Session, topic_id: int) -> Topic:
    topic = session.get(Topic, topic_id)
    if topic is None:
        raise HTTPException(404, "Topic not found")
    return topic


def get_source(session: Session, source_id: int) -> Source:
    source = session.get(Source, source_id)
    if source is None:
        raise HTTPException(404, "Source not found")
    return source


# ---------- Topics ----------


@router.get("/topics")
def list_topics(session: Session = Depends(get_session)) -> list[TopicOut]:
    """Every topic, disabled ones included, with its sources."""
    counts = article_counts(session)
    topics = session.exec(select(Topic).order_by(Topic.id))
    return [topic_out(session, topic, counts) for topic in topics]


@router.post("/topics")
def create_topic(body: TopicIn, session: Session = Depends(get_session)) -> TopicOut:
    name = required_text(body.name, "name")
    check_name_is_free(session, name)
    topic = Topic(name=name, description=required_text(body.description, "filtering instructions"))
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic_out(session, topic)


@router.put("/topics/{topic_id}")
def update_topic(topic_id: int, body: TopicUpdate, session: Session = Depends(get_session)) -> TopicOut:
    """Saves the fields that were sent. New instructions apply to the next articles only."""
    topic = get_topic(session, topic_id)
    if body.name is not None:
        name = required_text(body.name, "name")
        check_name_is_free(session, name, topic.id)  # before the change, or the query would flush it
        topic.name = name
    if body.description is not None:
        topic.description = required_text(body.description, "filtering instructions")
    if body.enabled is not None:
        topic.enabled = body.enabled
    session.add(topic)
    session.commit()
    session.refresh(topic)
    return topic_out(session, topic)


# ---------- Sources ----------


@router.post("/topics/{topic_id}/sources")
def add_source(topic_id: int, body: SourceIn, session: Session = Depends(get_session)) -> SourceOut:
    """Adds a site to a topic, after checking that its feed can be read."""
    topic = get_topic(session, topic_id)
    site_url = required_text(body.site_url, "site URL")
    source = Source(
        topic_id=topic.id,
        name=required_text(body.name, "name"),
        site_url=site_url,
        feed_url=checked_feed_url(site_url, (body.feed_url or "").strip() or None),
    )
    session.add(source)
    session.commit()
    session.refresh(source)
    return source_out(source, {})


@router.put("/sources/{source_id}")
def update_source(source_id: int, body: SourceUpdate, session: Session = Depends(get_session)) -> SourceOut:
    """Saves the fields that were sent. A changed site or feed URL is checked again."""
    source = get_source(session, source_id)
    if body.name is not None:
        source.name = required_text(body.name, "name")
    urls_changed = False
    if body.site_url is not None:
        site_url = required_text(body.site_url, "site URL")
        urls_changed = site_url != source.site_url
        source.site_url = site_url
    if body.feed_url is not None:
        feed_url = body.feed_url.strip() or None
        urls_changed = urls_changed or feed_url != source.feed_url
        source.feed_url = feed_url
    if urls_changed:
        source.feed_url = checked_feed_url(source.site_url, source.feed_url)
    if body.enabled is not None:
        source.enabled = body.enabled
    session.add(source)
    session.commit()
    session.refresh(source)
    return source_out(source, article_counts(session))


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: int, session: Session = Depends(get_session)) -> None:
    """Deletes a source added by mistake. One that brought articles can only be disabled."""
    source = get_source(session, source_id)
    if article_counts(session).get(source.id, 0):
        raise HTTPException(409, "This source already brought articles: disable it instead.")
    session.delete(source)
    session.commit()
