"""Reading side of the summaries: what the frontend shows.

summarizer.py writes the daily ones and period_summarizer.py the weekly and monthly
ones; this module reads back the summaries of one day, week or month, and turns the
article numbers chosen by the LLM into real titles and links.

Each summary belongs to a calendar date in the PC's local time, the one the
frontend navigates with:
- a daily summary to the day it was written (period_end), the morning it was read;
- a weekly summary to the Monday its week starts on (period_start);
- a monthly summary to the 1st of its month (period_start).
"""

from datetime import date, datetime, time, timedelta

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


class TopicSummaries(BaseModel):
    """One topic with its summaries of the date: none, one, or several daily ones
    when more than one collection ran that day (oldest first)."""

    topic_id: int
    topic_name: str
    summaries: list[SummaryOut]


class PeriodSummaries(BaseModel):
    """What the page shows for one period and date, and where it can go from there."""

    period: SummaryPeriod
    # The day, the Monday of the week or the 1st of the month shown.
    date: date
    # Every date of this period that has at least one summary, oldest first:
    # the arrows and the calendar of the page only offer these.
    available_dates: list[date]
    topics: list[TopicSummaries]


# ---------- Dates ----------


def period_date(period: SummaryPeriod, day: date) -> date:
    """The date that stands for the day, week or month holding `day`."""
    if period == SummaryPeriod.weekly:
        return day - timedelta(days=day.weekday())
    if period == SummaryPeriod.monthly:
        return day.replace(day=1)
    return day


def next_period_date(period: SummaryPeriod, start: date) -> date:
    """The first date of the period after the one starting on `start`."""
    if period == SummaryPeriod.weekly:
        return start + timedelta(days=7)
    if period == SummaryPeriod.monthly:
        return (start.replace(day=28) + timedelta(days=4)).replace(day=1)
    return start + timedelta(days=1)


def summary_date(summary: Summary) -> date:
    """The local date a stored summary belongs to (see the module docstring)."""
    moment = summary.period_end if summary.period == SummaryPeriod.daily else summary.period_start
    return moment.astimezone().date()


def local_midnight(day: date) -> datetime:
    return datetime.combine(day, time()).astimezone()


# ---------- Reading ----------


def summaries_of(session: Session, period: SummaryPeriod, day: date | None) -> PeriodSummaries:
    """The summaries of every enabled topic for the period holding `day`.

    Without a day, the latest date that has a summary is shown (today if there is none yet).
    """
    topics = session.exec(select(Topic).where(Topic.enabled).order_by(Topic.id)).all()
    topic_ids = [topic.id for topic in topics]
    available = sorted(
        {
            summary_date(row)
            for row in session.exec(
                select(Summary).where(Summary.period == period, Summary.topic_id.in_(topic_ids))
            )
        }
    )
    if day is None:
        shown = available[-1] if available else period_date(period, datetime.now().date())
    else:
        shown = period_date(period, day)

    # The bounds of the period in local time, so a summary written at 00:30 on the
    # user's clock falls on the right day whatever the UTC offset.
    start = local_midnight(shown)
    end = local_midnight(next_period_date(period, shown))
    column = Summary.period_end if period == SummaryPeriod.daily else Summary.period_start
    rows = session.exec(
        select(Summary)
        .where(
            Summary.period == period,
            Summary.topic_id.in_(topic_ids),
            column >= start,
            column < end,
        )
        .order_by(Summary.period_end)
    ).all()

    return PeriodSummaries(
        period=period,
        date=shown,
        available_dates=available,
        topics=[
            TopicSummaries(
                topic_id=topic.id,
                topic_name=topic.name,
                summaries=to_out(session, [row for row in rows if row.topic_id == topic.id]),
            )
            for topic in topics
        ],
    )


def to_out(session: Session, rows: list[Summary]) -> list[SummaryOut]:
    """The summaries as the frontend reads them, with the titles and links of their articles."""
    contents = [TopicSummary.model_validate_json(row.content) for row in rows]
    ids = {i for content in contents for point in content.points for i in point.article_ids}
    # One query for all the articles the summaries cite.
    articles = {a.id: a for a in session.exec(select(Article).where(Article.id.in_(ids)))}
    return [
        SummaryOut(
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
        for row, content in zip(rows, contents)
    ]
