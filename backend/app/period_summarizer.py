"""Weekly and monthly summaries, built from the daily summaries of the period.

The LLM does not read the articles again: it reads the points of the daily summaries,
which are already grouped by technology and kept only when actionable. That makes a
small prompt (about 7 x 5 points for a week, 30 x 5 for a month) and the article
numbers of the daily points carry over, so every weekly or monthly point still links
to real articles. The answer has the same structure as a daily summary (TopicSummary),
so the frontend shows it the same way.

Periods are calendar ones, in the PC's local time: a week runs from Monday 00:00 to
the next Monday 00:00, a month from the 1st to the 1st of the next month. Only a
finished period is summarized.

Try it on its own (reads the database, writes nothing):
    python -m app.period_summarizer week          # last finished week, in English
    python -m app.period_summarizer month fr      # last finished month, in French
"""

from datetime import datetime, timedelta

from langchain_core.language_models import BaseChatModel
from sqlmodel import Session, select

from app.models import Summary, SummaryPeriod, Topic
from app.summarizer import LANGUAGES, MAX_POINTS, TopicSummary

# The words used on the command line, and how the prompt names each period.
PERIODS = {"week": SummaryPeriod.weekly, "month": SummaryPeriod.monthly}
PERIOD_WORDS = {SummaryPeriod.weekly: "week", SummaryPeriod.monthly: "month"}


# ---------- Period bounds ----------


def last_finished_period(period: SummaryPeriod, now: datetime) -> tuple[datetime, datetime]:
    """Start and end of the last finished week or month before `now`.

    `now` must be in local time (datetime.now().astimezone()): a week starts on
    Monday midnight on the user's clock, not in UTC. The end is excluded.
    """
    midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
    if period == SummaryPeriod.weekly:
        end = midnight - timedelta(days=now.weekday())  # this week's Monday
        start = end - timedelta(days=7)
    elif period == SummaryPeriod.monthly:
        end = midnight.replace(day=1)  # the 1st of this month
        start = (end - timedelta(days=1)).replace(day=1)  # the 1st of the previous month
    else:
        raise ValueError(f"Not a weekly or monthly period: {period}")
    # Recomputing the offset handles a daylight saving change inside the period.
    return start.replace(tzinfo=None).astimezone(), end.replace(tzinfo=None).astimezone()


def daily_summaries_in(
    session: Session, topic: Topic, start: datetime, end: datetime
) -> list[Summary]:
    """The daily summaries of the topic written during [start, end), oldest first.

    A daily summary belongs to the day it was written (period_end), which is the
    morning the user read it.
    """
    return list(
        session.exec(
            select(Summary)
            .where(
                Summary.topic_id == topic.id,
                Summary.period == SummaryPeriod.daily,
                Summary.period_end >= start,
                Summary.period_end < end,
            )
            .order_by(Summary.period_end)
        )
    )


# ---------- Prompt and LLM call ----------


def period_prompt(
    topic: Topic, period: SummaryPeriod, dailies: list[Summary], language: str
) -> str:
    blocks = []
    for daily in dailies:
        content = TopicSummary.model_validate_json(daily.content)
        day = daily.period_end.astimezone()  # stored in UTC, shown on the local calendar
        lines = [f"Day {day:%Y-%m-%d}: {content.headline}"]
        for point in content.points:
            ids = ", ".join(str(i) for i in point.article_ids)
            lines.append(
                f"- {point.tech}: {point.whats_new} Agent tip: {point.agent_tip} Articles: [{ids}]"
            )
        blocks.append("\n".join(lines))
    word = PERIOD_WORDS[period]
    return (
        "You write the tech watch of a developer who works with coding agents.\n"
        "They do not want to learn to code from it: they want to know which new tools,\n"
        "libraries, models or features exist, so they can ask their coding agent to use them.\n"
        f"Topic: {topic.name}\n"
        f"What is relevant: {topic.description}\n\n"
        f"Below are the daily summaries of the past {word}. Write the summary of the {word}:\n"
        f"the {MAX_POINTS} points at most that mattered most over the whole {word}, one per\n"
        "technology. Merge the points of different days about the same thing into one,\n"
        "keeping the latest state of it. Prefer what lasts (a release, a new tool, a feature\n"
        "now available) to what was only a passing mention. Keep only points with a concrete\n"
        "agent_tip: something the developer can ask a coding agent to do now.\n"
        "Give each point the article numbers of the daily points it comes from in article_ids.\n"
        f"The headline sums up the {word} in one sentence.\n"
        f"Write in {LANGUAGES[language]}, even if the daily summaries use another language.\n\n"
        + "\n\n".join(blocks)
    )


def summarize_period(
    model: BaseChatModel,
    topic: Topic,
    period: SummaryPeriod,
    dailies: list[Summary],
    language: str = "en",
) -> TopicSummary:
    """One LLM call for the topic's period. Article ids not cited by a daily summary are dropped."""
    summary = model.with_structured_output(TopicSummary).invoke(
        period_prompt(topic, period, dailies, language)
    )
    known_ids = {
        i
        for daily in dailies
        for point in TopicSummary.model_validate_json(daily.content).points
        for i in point.article_ids
    }
    for point in summary.points:
        point.article_ids = [i for i in point.article_ids if i in known_ids]
    return summary


if __name__ == "__main__":
    import sys

    from app.database import engine
    from app.llm import get_chat_model, get_settings
    from app.models import Article

    # The Windows console defaults to cp1252, which cannot print every character.
    sys.stdout.reconfigure(encoding="utf-8")
    args = sys.argv[1:]
    if not args or args[0] not in PERIODS:
        usage = f"{'|'.join(PERIODS)} [{'|'.join(LANGUAGES)}]"
        sys.exit(f"Usage: python -m app.period_summarizer {usage}")
    period = PERIODS[args[0]]
    language = args[1] if len(args) > 1 else "en"
    if language not in LANGUAGES:
        sys.exit(f"Unknown language {language!r}, use one of: {', '.join(LANGUAGES)}")

    start, end = last_finished_period(period, datetime.now().astimezone())
    with Session(engine) as session:
        model = get_chat_model(get_settings(session))
        for topic in session.exec(select(Topic).where(Topic.enabled)):
            dailies = daily_summaries_in(session, topic, start, end)
            print(f"\n=== {topic.name}: {len(dailies)} daily summaries", end=" ")
            print(f"from {start:%Y-%m-%d} to {end - timedelta(days=1):%Y-%m-%d} ===")
            if not dailies:
                print("No daily summary in this period.")
                continue
            summary = summarize_period(model, topic, period, dailies, language)
            ids = {i for point in summary.points for i in point.article_ids}
            titles = {
                a.id: a.title for a in session.exec(select(Article).where(Article.id.in_(ids)))
            }
            print(summary.headline)
            for point in summary.points:
                print(f"\n* {point.tech}\n  {point.whats_new}\n  -> {point.agent_tip}")
                for article_id in point.article_ids:
                    print(f"     [{article_id}] {titles.get(article_id, '?')}")
