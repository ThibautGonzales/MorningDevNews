"""Relevance judge: asks the LLM which articles matter for a topic, in two passes.

1. Titles only, by batches: the LLM answers relevant, not_relevant or unsure.
2. For the unsure ones only, the title plus the feed's content snippet: relevant or not.
Most articles are sorted out by their title, so few tokens are spent on content.

Try it on its own (reads the database, writes nothing):
    python -m app.relevance
"""

from dataclasses import dataclass
from typing import Literal

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from app.models import Article, Topic

BATCH_SIZE = 20


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


if __name__ == "__main__":
    import sys

    from sqlmodel import Session, select

    from app.database import engine
    from app.llm import get_chat_model, get_settings
    from app.models import Source

    # The Windows console defaults to cp1252, which cannot print every character an
    # article title or an LLM reason may contain.
    sys.stdout.reconfigure(encoding="utf-8")

    with Session(engine) as session:
        model = get_chat_model(get_settings(session))
        for topic in session.exec(select(Topic).where(Topic.enabled)):
            articles = session.exec(
                select(Article)
                .join(Source)
                .where(Source.topic_id == topic.id)
                .order_by(Article.published_at.desc())
                .limit(BATCH_SIZE)
            ).all()
            print(f"\n=== {topic.name}: {len(articles)} most recent articles ===")
            titles = {a.id: a.title for a in articles}
            for j in judge_articles(model, topic, articles):
                mark = "[YES]" if j.is_relevant else "[NO] "
                print(f"{mark} {titles[j.article_id]}\n    {j.reason}")
