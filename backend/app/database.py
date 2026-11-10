"""SQLite connection: where the database file lives and how to open a session."""

from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import inspect
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
    add_missing_columns()


def add_missing_columns() -> None:
    """Adds to existing tables the columns added to the models since the file was created.

    create_all() only creates missing tables, it never changes an existing one. Without this,
    a new field (e.g. Run.articles_relevant) would mean deleting the database. Only additions
    are handled: a renamed or removed field still needs a manual change.
    """
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in SQLModel.metadata.sorted_tables:
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                ddl = f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column.type.compile(engine.dialect)}'
                # SQLite refuses a NOT NULL column without a default, so we give the model's default.
                if column.default is not None and column.default.is_scalar:
                    ddl += f" NOT NULL DEFAULT {column.default.arg!r}"
                connection.exec_driver_sql(ddl)


def get_session() -> Iterator[Session]:
    """FastAPI dependency: one session per request, closed afterwards."""
    with Session(engine) as session:
        yield session
