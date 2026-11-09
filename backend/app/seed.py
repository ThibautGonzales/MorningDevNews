"""Example topics inserted on the first start, so the app is usable right away."""

from sqlmodel import Session, select

from app.database import engine
from app.models import Source, Topic

EXAMPLE_TOPICS = [
    {
        "name": "AI / LLM",
        "description": (
            "News about large language models and generative AI: new model releases, "
            "benchmarks, research papers, tooling for developers (agents, RAG, prompting), "
            "and notable industry announcements. Ignore pure business or funding news."
        ),
        "sources": [
            ("Simon Willison", "https://simonwillison.net", "https://simonwillison.net/atom/everything/"),
            ("Hugging Face Blog", "https://huggingface.co/blog", "https://huggingface.co/blog/feed.xml"),
            ("OpenAI News", "https://openai.com/news", "https://openai.com/news/rss.xml"),
        ],
    },
    {
        "name": "Full stack",
        "description": (
            "Web development news useful to a full stack developer working with Angular "
            "and Python: framework releases, new browser and CSS features, backend and API "
            "practices, tooling, and in-depth tutorials. Ignore beginner-level content."
        ),
        "sources": [
            ("Angular Blog", "https://blog.angular.dev", "https://blog.angular.dev/feed"),
            ("Real Python", "https://realpython.com", "https://realpython.com/atom.xml"),
            ("Smashing Magazine", "https://www.smashingmagazine.com", "https://www.smashingmagazine.com/feed/"),
        ],
    },
]


def seed_example_topics() -> None:
    """Inserts the example topics only when the topic table is empty.

    That way, topics you edit or delete later are never recreated on restart.
    """
    with Session(engine) as session:
        if session.exec(select(Topic)).first() is not None:
            return

        for example in EXAMPLE_TOPICS:
            topic = Topic(name=example["name"], description=example["description"])
            session.add(topic)
            session.flush()  # gives topic.id a value, needed by the sources below
            for name, site_url, feed_url in example["sources"]:
                session.add(Source(topic_id=topic.id, name=name, site_url=site_url, feed_url=feed_url))

        session.commit()
