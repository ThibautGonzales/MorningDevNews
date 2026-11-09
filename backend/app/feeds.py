"""Reading RSS/Atom feeds: find a site's feed, download it and turn its items into FeedEntry objects.

Nothing here touches the database, so it can be tried on its own:
    python -m app.feeds https://simonwillison.net/atom/everything/
    python -m app.feeds --discover https://simonwillison.net
"""

import calendar
import html
import re
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from html.parser import HTMLParser
from urllib.parse import urljoin

import feedparser
import httpx

# Some sites reject requests without a User-Agent, so we say who we are.
USER_AGENT = "MorningDevNews/0.1 (personal RSS reader)"
TIMEOUT_SECONDS = 15
SNIPPET_MAX_LENGTH = 500
FEED_TYPES = {"application/rss+xml", "application/atom+xml"}


@dataclass
class FeedEntry:
    """One item of a feed, with only the fields we store in the Article table."""

    url: str
    title: str
    published_at: datetime | None
    content_snippet: str | None


def http_get(url: str) -> httpx.Response:
    """GETs a URL with our User-Agent and timeout. Raises httpx.HTTPError on failure."""
    response = httpx.get(
        url,
        headers={"User-Agent": USER_AGENT},
        timeout=TIMEOUT_SECONDS,
        follow_redirects=True,
    )
    response.raise_for_status()
    return response


def download(url: str) -> bytes:
    """Downloads a URL and returns its raw content."""
    return http_get(url).content


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


class _FeedLinkFinder(HTMLParser):
    """Collects the href of every <link rel="alternate"> that points to a RSS or Atom feed."""

    def __init__(self) -> None:
        super().__init__()
        self.feed_hrefs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag != "link":
            return
        attributes = dict(attrs)
        rel = (attributes.get("rel") or "").lower().split()
        feed_type = (attributes.get("type") or "").lower()
        href = attributes.get("href")
        if "alternate" in rel and feed_type in FEED_TYPES and href:
            self.feed_hrefs.append(href)


def find_feed_link(page_html: str, page_url: str) -> str | None:
    """Returns the absolute URL of the first feed advertised in a HTML page, or None."""
    finder = _FeedLinkFinder()
    finder.feed(page_html)
    if not finder.feed_hrefs:
        return None
    # The href is often relative ("/feed.xml"), so we resolve it against the page URL.
    return urljoin(page_url, finder.feed_hrefs[0])


def discover_feed_url(site_url: str) -> str | None:
    """Downloads a site's home page and returns the feed URL it advertises, or None."""
    response = http_get(site_url)
    # response.url is the URL after redirects, the right base for a relative href.
    return find_feed_link(response.text, str(response.url))


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
    if sys.argv[1] == "--discover":
        print(discover_feed_url(sys.argv[2]))
        sys.exit()
    for entry in fetch_feed(sys.argv[1]):
        print(f"{entry.published_at}  {entry.title}\n    {entry.url}")
