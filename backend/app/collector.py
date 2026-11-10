"""Collection job: reads the feed of every enabled source and stores the new articles.

Try it on its own (it creates and seeds the database if needed):
    python -m app.collector
"""

from sqlmodel import Session, select

from app.feeds import FeedEntry, discover_feed_url, fetch_feed
from app.models import Article, Run, RunStatus, Source, utc_now
from app.period_summarizer import summarize_finished_periods
from app.relevance import judge_new_articles
from app.summarizer import summarize_new_articles


class FeedNotFoundError(Exception):
    """The source has no feed_url and its site does not advertise any feed."""


def run_collection(session: Session, language: str = "en") -> Run:
    """Collects every enabled source, judges the new articles, summarizes them per topic
    (in `language`), summarizes the last finished week and month if not done yet, and
    records it all as a Run.

    A failing source is logged in run.error and skipped: the other sources still run.
    """
    run = Run()
    session.add(run)
    session.commit()  # the run is visible as "running" while the job works

    sources = session.exec(select(Source).where(Source.enabled)).all()
    added = 0
    errors = []
    for source in sources:
        try:
            added += collect_source(session, source)
        except Exception as exc:  # one broken site must not stop the whole job
            session.rollback()
            errors.append(f"{source.name}: {exc}")

    # Counted in a local variable: a rollback reloads run from the database,
    # which would wipe a counter kept on run.articles_fetched.
    run.articles_fetched = added
    # "failed" only when nothing worked at all; partial failures stay a success.
    all_failed = bool(sources) and len(errors) == len(sources)
    run.status = RunStatus.failed if all_failed else RunStatus.success
    run.error = "\n".join(errors) or None
    session.add(run)
    session.commit()  # saved before judging, so a rollback in the judge cannot undo it

    judge_new_articles(session, run)
    summarize_new_articles(session, run, language)
    summarize_finished_periods(session, run, language)  # reads the daily summaries above
    run.finished_at = utc_now()
    session.add(run)
    session.commit()
    session.refresh(run)
    return run


def collect_source(session: Session, source: Source) -> int:
    """Reads one source's feed, stores its new articles and returns how many were added."""
    if not source.feed_url:
        source.feed_url = discover_feed_url(source.site_url)
        if not source.feed_url:
            raise FeedNotFoundError(f"no feed advertised on {source.site_url}")

    added = save_new_articles(session, source, fetch_feed(source.feed_url))
    source.last_fetched_at = utc_now()
    session.add(source)
    session.commit()
    return added


def save_new_articles(session: Session, source: Source, entries: list[FeedEntry]) -> int:
    """Adds the entries whose URL is not in the database yet. Returns how many were added."""
    urls = [entry.url for entry in entries]
    # One query for the whole feed rather than one per article.
    known_urls = set(session.exec(select(Article.url).where(Article.url.in_(urls))))

    added = 0
    for entry in entries:
        if entry.url in known_urls:
            continue
        known_urls.add(entry.url)  # a feed can list the same URL twice
        session.add(
            Article(
                source_id=source.id,
                url=entry.url,
                title=entry.title,
                published_at=entry.published_at,
                content_snippet=entry.content_snippet,
            )
        )
        added += 1
    return added


if __name__ == "__main__":
    from app.database import create_db_and_tables, engine
    from app.seed import seed_example_topics

    create_db_and_tables()
    seed_example_topics()
    with Session(engine) as session:
        result = run_collection(session)
        print(
            f"Run {result.id}: {result.status.value}, {result.articles_fetched} new articles, "
            f"{result.articles_relevant} relevant out of {result.articles_judged} judged, "
            f"{result.summaries_created} summaries"
        )
        if result.error:
            print(f"Errors:\n{result.error}")
