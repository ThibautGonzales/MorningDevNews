"""Relevance judge: asks the LLM which articles matter for a topic, in two passes.

1. Titles only, by batches: the LLM answers relevant, not_relevant or unsure.
2. For the unsure ones only, the title plus the feed's content snippet: relevant or not.
Most articles are sorted out by their title, so few tokens are spent on content.

After each collection, judge_new_articles() runs it on the new articles and saves the verdicts.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta
from typing import Literal

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field
from sqlmodel import Session, and_, or_, select

from app.llm import LlmNotConfiguredError, get_chat_model, get_settings
from app.models import Article, Run, Source, Topic, utc_now

BATCH_SIZE = 20
# Only recent articles are judged: the first collection brings back months of history.
MAX_AGE_DAYS = 7
# Upper bound on LLM work per run, whatever the number of new articles.
MAX_ARTICLES_PER_RUN = 200


# ---------- What the LLM must answer (validated by LangChain's structured output) ----------


class TitleVerdict(BaseModel):
    id: int = Field(description="The article number given in the list")
    verdict: Literal["relevant", "not_relevant", "unsure"]
    reason: str = Field(description="One short sentence")


class TitleVerdicts(BaseModel):
    verdicts: list[TitleVerdict]


class ContentVerdict(BaseModel):
    id: int = Field(description="The article number given in the list")
    relevant: bool
    reason: str = Field(description="One short sentence")


class ContentVerdicts(BaseModel):
    verdicts: list[ContentVerdict]


@dataclass
class Judgment:
    """Final decision for one article, ready to be stored in Article.is_relevant/relevance_reason."""

    article_id: int
    is_relevant: bool
    reason: str


# ---------- Prompts ----------


def topic_instructions(topic: Topic) -> str:
    return (
        "You sort articles for a developer's daily tech watch.\n"
        f"Topic: {topic.name}\n"
        f"What is relevant: {topic.description}\n"
        "Give one verdict per article, with the article's number as id."
    )


def titles_prompt(topic: Topic, articles: list[Article]) -> str:
    lines = "\n".join(f"[{a.id}] {a.title}" for a in articles)
    return (
        f"{topic_instructions(topic)}\n"
        "You only see the titles. Answer unsure when the title alone is not enough to decide.\n\n"
        f"{lines}"
    )


def contents_prompt(topic: Topic, articles: list[Article]) -> str:
    blocks = "\n\n".join(
        f"[{a.id}] {a.title}\n{a.content_snippet or '(no summary available)'}" for a in articles
    )
    return (
        f"{topic_instructions(topic)}\n"
        "You see the title and the beginning of each article. Decide: relevant or not.\n\n"
        f"{blocks}"
    )


# ---------- The two passes ----------


def batches(articles: list[Article], size: int = BATCH_SIZE) -> list[list[Article]]:
    return [articles[i : i + size] for i in range(0, len(articles), size)]


def judge_titles(model: BaseChatModel, topic: Topic, articles: list[Article]) -> list[TitleVerdict]:
    """Pass 1: one LLM call per batch of titles."""
    judge = model.with_structured_output(TitleVerdicts)
    verdicts = []
    for batch in batches(articles):
        verdicts += judge.invoke(titles_prompt(topic, batch)).verdicts
    return verdicts


def judge_contents(model: BaseChatModel, topic: Topic, articles: list[Article]) -> list[ContentVerdict]:
    """Pass 2: one LLM call per batch of title + snippet."""
    judge = model.with_structured_output(ContentVerdicts)
    verdicts = []
    for batch in batches(articles):
        verdicts += judge.invoke(contents_prompt(topic, batch)).verdicts
    return verdicts


def judge_articles(model: BaseChatModel, topic: Topic, articles: list[Article]) -> list[Judgment]:
    """Runs both passes for articles of one topic and returns the final decisions.

    An article the LLM forgot to answer about gets no Judgment: it stays unjudged
    (is_relevant None) and will be tried again on the next run.
    """
    by_id = {a.id: a for a in articles}  # also ignores ids the LLM may have invented
    judgments = []
    unsure = []
    for v in judge_titles(model, topic, articles):
        if v.id not in by_id:
            continue
        if v.verdict == "unsure":
            unsure.append(by_id[v.id])
        else:
            judgments.append(Judgment(v.id, v.verdict == "relevant", v.reason))

    if unsure:
        for v in judge_contents(model, topic, unsure):
            if v.id in by_id:
                judgments.append(Judgment(v.id, v.relevant, v.reason))
    return judgments


# ---------- After a collection: judge the new articles and save the verdicts ----------


def pending_articles(session: Session) -> list[tuple[Article, int]]:
    """Not yet judged articles of the last MAX_AGE_DAYS, most recent first, with their topic id.

    An article without a publication date counts from the day it was fetched.
    """
    cutoff = utc_now() - timedelta(days=MAX_AGE_DAYS)
    recent = or_(
        Article.published_at >= cutoff,
        and_(Article.published_at.is_(None), Article.fetched_at >= cutoff),
    )
    query = (
        select(Article, Source.topic_id)
        .join(Source)
        .join(Topic)
        .where(Article.is_relevant.is_(None), Topic.enabled, recent)
        .order_by(Article.published_at.desc())
        .limit(MAX_ARTICLES_PER_RUN)
    )
    return list(session.exec(query))


def save_judgments(session: Session, articles: list[Article], judgments: list[Judgment]) -> None:
    by_id = {a.id: a for a in articles}
    for j in judgments:
        article = by_id[j.article_id]
        article.is_relevant = j.is_relevant
        article.relevance_reason = j.reason
        session.add(article)
    session.commit()


def judge_new_articles(session: Session, run: Run) -> None:
    """Judges the pending articles topic by topic and records the counts on the run.

    Never raises: a missing LLM setting or a provider error is added to run.error, and
    the articles left unjudged will be tried again on the next run.
    """
    try:
        model = get_chat_model(get_settings(session))
    except LlmNotConfiguredError as exc:
        run.error = "\n".join(filter(None, [run.error, f"Relevance skipped: {exc}"]))
        return

    articles_by_topic = defaultdict(list)
    for article, topic_id in pending_articles(session):
        articles_by_topic[topic_id].append(article)

    judged = relevant = 0
    errors = []
    for topic_id, articles in articles_by_topic.items():
        topic = session.get(Topic, topic_id)
        try:
            judgments = judge_articles(model, topic, articles)
            save_judgments(session, articles, judgments)
        except Exception as exc:  # one failing topic (quota, timeout) must not stop the others
            session.rollback()
            errors.append(f"Relevance ({topic.name}): {exc}")
            continue
        judged += len(judgments)
        relevant += sum(j.is_relevant for j in judgments)

    # Set after the loop: a rollback reloads run from the database (see collector.py).
    run.articles_judged = judged
    run.articles_relevant = relevant
    run.error = "\n".join(filter(None, [run.error, *errors])) or None
