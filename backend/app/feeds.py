"""Reading RSS/Atom feeds: download a feed and turn its items into simple FeedEntry objects.

Nothing here touches the database, so it can be tried on its own:
    python -m app.feeds https://simonwillison.net/atom/everything/
"""

import calendar
import html
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime

import feedparser
import httpx

# Some sites reject requests without a User-Agent, so we say who we are.
USER_AGENT = "MorningDevNews/0.1 (personal RSS reader)"
TIMEOUT_SECONDS = 15
SNIPPET_MAX_LENGTH = 500


@dataclass
class FeedEntry:
    """One item of a feed, with only the fields we store in the Article table."""

    url: str
    title: str
    published_at: datetime | None
    content_snippet: str | None


def download(url: str) -> bytes:
    """Downloads a URL and returns its raw content. Raises httpx.HTTPError on failure."""
    response = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    response.raise_for_status()
    return response.content


def parse_feed(content: bytes) -> list[FeedEntry]:
    """Turns the raw content of a RSS or Atom feed into FeedEntry objects."""
    parsed = feedparser.parse(content)
    entries = []
    for item in parsed.entries:
        url = item.get("link")
        if not url:
            continue  # without a URL we cannot deduplicate nor open the article
        entries.append(
            FeedEntry(
                url=url,
                title=item.get("title", "").strip() or url,
                published_at=_entry_date(item),
                content_snippet=_snippet(item.get("summary")),
            )
        )
    return entries


def fetch_feed(feed_url: str) -> list[FeedEntry]:
    """Downloads a feed and returns its items."""
    return parse_feed(download(feed_url))


def _entry_date(item: feedparser.FeedParserDict) -> datetime | None:
    # feedparser normalises every date format into a UTC time.struct_time.
    parsed_time = item.get("published_parsed") or item.get("updated_parsed")
    if parsed_time is None:
        return None
    return datetime.fromtimestamp(calendar.timegm(parsed_time), UTC)


def _snippet(summary: str | None) -> str | None:
    # Summaries often contain HTML. We keep plain text only: it is shorter to store
    # and cheaper to send to the LLM later.
    if not summary:
        return None
    text = html.unescape(re.sub(r"<[^>]+>", " ", summary))
    text = " ".join(text.split())  # collapses spaces and line breaks
    return text[:SNIPPET_MAX_LENGTH] or None


if __name__ == "__main__":
    for entry in fetch_feed(sys.argv[1]):
        print(f"{entry.published_at}  {entry.title}\n    {entry.url}")
