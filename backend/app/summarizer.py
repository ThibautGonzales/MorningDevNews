"""Daily summary: asks the LLM what is new for a topic since the last summary.

The goal is not to learn to code from the news, but to spot new tools, libraries and
features you could ask a coding agent to use. The LLM answers in a fixed structure
(a headline and a few points), like the relevance judge, so the frontend can show it
without parsing free text and every point links to real articles.

Try it on its own (reads the database, writes nothing):
    python -m app.summarizer          # summary in English
    python -m app.summarizer fr       # summary in French
After each collection, summarize_new_articles() runs it for every topic and saves the summaries.
"""

from datetime import datetime, timedelta

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field
from sqlmodel import Session, and_, or_, select

from app.llm import LlmNotConfiguredError, get_chat_model, get_settings
from app.models import Article, Run, Source, Summary, SummaryPeriod, Topic, utc_now
from app.relevance import MAX_AGE_DAYS

# The languages the frontend offers (see frontend/src/app/core/i18n).
LANGUAGES = {"en": "English", "fr": "French"}
# The first summary of a topic covers the last day, like a usual morning.
FIRST_WINDOW_HOURS = 24
# Upper bound on what one summary reads, to keep the prompt (and its cost) small.
MAX_ARTICLES_PER_SUMMARY = 50
# A short list read in two minutes beats an exhaustive one.
MAX_POINTS = 5


# ---------- What the LLM must answer (validated by LangChain's structured output) ----------


class SummaryPoint(BaseModel):
    tech: str = Field(description="The tool, library, model or feature, in a few words")
    whats_new: str = Field(description="What changed or appeared, in one or two sentences")
    agent_tip: str = Field(
        description="How a developer could ask a coding agent to use it, in one sentence"
    )
    article_ids: list[int] = Field(description="The numbers of the articles this point comes from")


class TopicSummary(BaseModel):
    headline: str = Field(description="The one sentence to read if you read nothing else")
    points: list[SummaryPoint]


# ---------- Which articles to summarize ----------


def window_start(session: Session, topic: Topic, now: datetime) -> datetime:
    """Where the next summary of the topic starts: where its last daily summary ended.

    Without a previous summary it is FIRST_WINDOW_HOURS ago. It is never older than
    MAX_AGE_DAYS, the oldest articles the relevance judge looks at.
    """
    last_end = session.exec(
        select(Summary.period_end)
        .where(Summary.topic_id == topic.id, Summary.period == SummaryPeriod.daily)
        .order_by(Summary.period_end.desc())
    ).first()
    start = last_end or now - timedelta(hours=FIRST_WINDOW_HOURS)
    # SQLite gives back naive datetimes: they were stored in UTC.
    if start.tzinfo is None:
        start = start.replace(tzinfo=now.tzinfo)
    return max(start, now - timedelta(days=MAX_AGE_DAYS))


def articles_to_summarize(session: Session, topic: Topic, since: datetime) -> list[Article]:
    """The relevant articles of the topic collected after `since`, most recent first.

    "Collected" (fetched_at) rather than "published": a feed can publish an article
    with a date older than our last summary, and it would otherwise never be summarized.
    The published_at filter only drops old history brought back by a first collection
    (an article without a date counts from the day it was fetched, as in relevance.py).
    """
    oldest = utc_now() - timedelta(days=MAX_AGE_DAYS)
    return list(
        session.exec(
            select(Article)
            .join(Source)
            .where(
                Source.topic_id == topic.id,
                Article.is_relevant,
                Article.fetched_at > since,
                or_(
                    Article.published_at >= oldest,
                    and_(Article.published_at.is_(None), Article.fetched_at >= oldest),
                ),
            )
            .order_by(Article.published_at.desc())
            .limit(MAX_ARTICLES_PER_SUMMARY)
        )
    )


# ---------- Prompt and LLM call ----------


def summary_prompt(topic: Topic, articles: list[Article], language: str) -> str:
    blocks = "\n\n".join(
        f"[{a.id}] {a.title}\n{a.content_snippet or '(no summary available)'}" for a in articles
    )
    return (
        "You write the morning tech watch of a developer who works with coding agents.\n"
        "They do not want to learn to code from it: they want to know which new tools,\n"
        "libraries, models or features exist, so they can ask their coding agent to use them.\n"
        f"Topic: {topic.name}\n"
        f"What is relevant: {topic.description}\n\n"
        f"Group the articles below into a few points (at most {MAX_POINTS}), one per technology.\n"
        "Merge articles about the same thing, skip what brings nothing new.\n"
        "Only keep a point if you can give a concrete agent_tip: something the developer can\n"
        "ask a coding agent to do now. Drop news, research, benchmarks and stories with no\n"
        "such action, rather than writing a vague or \"not usable yet\" tip.\n"
        "Give each point the numbers of its articles in article_ids.\n"
        f"Write in {LANGUAGES[language]}.\n\n"
        f"{blocks}"
    )


def summarize_topic(
    model: BaseChatModel, topic: Topic, articles: list[Article], language: str = "en"
) -> TopicSummary:
    """One LLM call for the whole topic. Article ids the LLM invented are dropped."""
    summary = model.with_structured_output(TopicSummary).invoke(
        summary_prompt(topic, articles, language)
    )
    known_ids = {a.id for a in articles}
    for point in summary.points:
        point.article_ids = [i for i in point.article_ids if i in known_ids]
    return summary


# ---------- After a collection: summarize every topic and save the summaries ----------


def summarize_new_articles(session: Session, run: Run, language: str = "en") -> None:
    """Writes one daily Summary per enabled topic that has new relevant articles.

    A topic without news gets no LLM call and no Summary, so its next summary still
    starts where the last one ended. Never raises, like judge_new_articles(): errors go
    to run.error, and a failed topic is simply summarized on the next run.
    """
    try:
        model = get_chat_model(get_settings(session))
    except LlmNotConfiguredError as exc:
        run.error = "\n".join(filter(None, [run.error, f"Summary skipped: {exc}"]))
        return

    now = utc_now()
    created = 0
    errors = []
    for topic in session.exec(select(Topic).where(Topic.enabled)).all():
        since = window_start(session, topic, now)
        articles = articles_to_summarize(session, topic, since)
        if not articles:
            continue
        try:
            summary = summarize_topic(model, topic, articles, language)
        except Exception as exc:  # one failing topic (quota, timeout) must not stop the others
            errors.append(f"Summary ({topic.name}): {exc}")
            continue
        session.add(
            Summary(
                topic_id=topic.id,
                period=SummaryPeriod.daily,
                period_start=since,
                period_end=now,
                content=summary.model_dump_json(),
            )
        )
        session.commit()
        created += 1

    run.summaries_created = created
    run.error = "\n".join(filter(None, [run.error, *errors])) or None


if __name__ == "__main__":
    import sys

    from app.database import engine

    # The Windows console defaults to cp1252, which cannot print every character.
    sys.stdout.reconfigure(encoding="utf-8")
    language = sys.argv[1] if len(sys.argv) > 1 else "en"
    if language not in LANGUAGES:
        sys.exit(f"Unknown language {language!r}, use one of: {', '.join(LANGUAGES)}")

    now = utc_now()
    with Session(engine) as session:
        model = get_chat_model(get_settings(session))
        for topic in session.exec(select(Topic).where(Topic.enabled)):
            since = window_start(session, topic, now)
            articles = articles_to_summarize(session, topic, since)
            print(f"\n=== {topic.name}: {len(articles)} relevant articles", end=" ")
            print(f"collected since {since:%Y-%m-%d %H:%M} UTC ===")
            if not articles:
                print("Nothing new.")
                continue
            titles = {a.id: a.title for a in articles}
            summary = summarize_topic(model, topic, articles, language)
            print(summary.headline)
            for point in summary.points:
                print(f"\n* {point.tech}\n  {point.whats_new}\n  -> {point.agent_tip}")
                for article_id in point.article_ids:
                    print(f"     [{article_id}] {titles[article_id]}")
