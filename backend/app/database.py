"""SQLite connection: where the database file lives and how to open a session."""

from collections.abc import Iterator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

# The file sits in backend/, next to app/. It is ignored by Git (*.db in .gitignore).
DATABASE_PATH = Path(__file__).resolve().parent.parent / "morningdevnews.db"

# check_same_thread=False: FastAPI may use the connection from several threads,
# which SQLite refuses by default.
engine = create_engine(
    f"sqlite:///{DATABASE_PATH}",
    connect_args={"check_same_thread": False},
)


def create_db_and_tables() -> None:
    """Creates the tables that do not exist yet. Existing data is kept."""
    # Importing the models registers the tables in SQLModel.metadata.
    from app import models  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    with Session(engine) as session:
        yield session
