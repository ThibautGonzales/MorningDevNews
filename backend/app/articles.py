"""Reading side of the articles: what the frontend shows."""

from datetime import datetime, timedelta

from pydantic import BaseModel
from sqlmodel import Session, select

from app.models import Article, Source, Topic, utc_now
from app.relevance import MAX_AGE_DAYS


class RelevantArticle(BaseModel):
    id: int
    title: str
    url: str
    published_at: datetime | None
    source_name: str
    relevance_reason: str | None


class TopicArticles(BaseModel):
    """One topic with its relevant articles, most recent first."""

    topic_id: int
    topic_name: str
    articles: list[RelevantArticle]


def relevant_articles_by_topic(session: Session, days: int = MAX_AGE_DAYS) -> list[TopicArticles]:
    """The articles judged relevant in the last `days` days, grouped by enabled topic.

    Every enabled topic is listed, even without articles, so the page shows it as empty.
    """
    cutoff = utc_now() - timedelta(days=days)
    topics = session.exec(select(Topic).where(Topic.enabled).order_by(Topic.id)).all()
    rows = session.exec(
        select(Article, Source)
        .join(Source)
        .where(Article.is_relevant, Article.published_at >= cutoff)
        .order_by(Article.published_at.desc())
    ).all()

    groups = {t.id: TopicArticles(topic_id=t.id, topic_name=t.name, articles=[]) for t in topics}
    for article, source in rows:
        if source.topic_id in groups:  # skips articles of a disabled topic
            groups[source.topic_id].articles.append(
                RelevantArticle(
                    id=article.id,
                    title=article.title,
                    url=article.url,
                    published_at=article.published_at,
                    source_name=source.name,
                    relevance_reason=article.relevance_reason,
                )
            )
    return list(groups.values())
