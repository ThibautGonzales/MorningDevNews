"""Database tables. Each class is both a SQLite table and a model the API can return."""

from datetime import UTC, datetime
from enum import Enum

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(UTC)


class Topic(SQLModel, table=True):
    """A watch subject, e.g. "AI / LLM". The description tells the LLM what is relevant."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(unique=True)
    description: str
    enabled: bool = True
    created_at: datetime = Field(default_factory=utc_now)


class Source(SQLModel, table=True):
    """A website followed for one topic, read through its RSS/Atom feed."""

    id: int | None = Field(default=None, primary_key=True)
    topic_id: int = Field(foreign_key="topic.id", index=True)
    name: str
    site_url: str
    # Filled by feed autodiscovery from site_url (a later step) or given directly.
    feed_url: str | None = None
    enabled: bool = True
    last_fetched_at: datetime | None = None


class Article(SQLModel, table=True):
    """An item read from a feed. The URL is unique so a rerun never stores it twice."""

    id: int | None = Field(default=None, primary_key=True)
    source_id: int = Field(foreign_key="source.id", index=True)
    url: str = Field(unique=True)
    title: str
    published_at: datetime | None = None
    content_snippet: str | None = None
    fetched_at: datetime = Field(default_factory=utc_now)
    # None until the LLM has judged the article against its topic.
    is_relevant: bool | None = None
    relevance_reason: str | None = None


class RunStatus(str, Enum):
    running = "running"
    success = "success"
    failed = "failed"


class Run(SQLModel, table=True):
    """One execution of the collection job. The last successful run tells us "since when"."""

    id: int | None = Field(default=None, primary_key=True)
    started_at: datetime = Field(default_factory=utc_now)
    finished_at: datetime | None = None
    status: RunStatus = RunStatus.running
    articles_fetched: int = 0
    error: str | None = None


class SummaryPeriod(str, Enum):
    daily = "daily"
    weekly = "weekly"
    monthly = "monthly"


class Summary(SQLModel, table=True):
    """An LLM summary of one topic over a period. Weekly/monthly ones are built from daily ones."""

    id: int | None = Field(default=None, primary_key=True)
    topic_id: int = Field(foreign_key="topic.id", index=True)
    period: SummaryPeriod
    period_start: datetime
    period_end: datetime
    content: str
    created_at: datetime = Field(default_factory=utc_now)
