"""Reading side of the summaries: what the frontend shows.

summarizer.py writes the daily ones and period_summarizer.py the weekly and monthly
ones; this module reads the latest one of each topic back, for the period asked, and
turns the article numbers chosen by the LLM into real titles and links.
"""

from datetime import datetime

from pydantic import BaseModel
from sqlmodel import Session, select

from app.models import Article, Summary, SummaryPeriod, Topic
from app.summarizer import TopicSummary


class SummaryArticle(BaseModel):
    id: int
    title: str
    url: str


class SummaryPointOut(BaseModel):
    tech: str
    whats_new: str
    agent_tip: str
    articles: list[SummaryArticle]


class SummaryOut(BaseModel):
    period_start: datetime
    period_end: datetime
    headline: str
    points: list[SummaryPointOut]


class TopicLatestSummary(BaseModel):
    """One topic with its latest summary of a period, or None if it never had one."""

    topic_id: int
    topic_name: str
    summary: SummaryOut | None


def latest_summaries(session: Session, period: SummaryPeriod) -> list[TopicLatestSummary]:
    """The latest summary of the period for every enabled topic, in topic order."""
    topics = session.exec(select(Topic).where(Topic.enabled).order_by(Topic.id)).all()
    return [
        TopicLatestSummary(
            topic_id=topic.id,
            topic_name=topic.name,
            summary=latest_summary(session, topic, period),
        )
        for topic in topics
    ]


def latest_summary(session: Session, topic: Topic, period: SummaryPeriod) -> SummaryOut | None:
    row = session.exec(
        select(Summary)
        .where(Summary.topic_id == topic.id, Summary.period == period)
        .order_by(Summary.period_end.desc())
    ).first()
    if row is None:
        return None

    content = TopicSummary.model_validate_json(row.content)
    ids = {i for point in content.points for i in point.article_ids}
    # One query for all the articles the summary cites.
    articles = {a.id: a for a in session.exec(select(Article).where(Article.id.in_(ids)))}
    return SummaryOut(
        period_start=row.period_start,
        period_end=row.period_end,
        headline=content.headline,
        points=[
            SummaryPointOut(
                tech=point.tech,
                whats_new=point.whats_new,
                agent_tip=point.agent_tip,
                articles=[
                    SummaryArticle(id=a.id, title=a.title, url=a.url)
                    for a in (articles.get(i) for i in point.article_ids)
                    if a is not None
                ],
            )
            for point in content.points
        ],
    )
