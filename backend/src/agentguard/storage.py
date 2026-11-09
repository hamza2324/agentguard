import os
from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, DateTime, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column


class Base(DeclarativeBase):
    pass


class Record(Base):
    __tablename__ = "records"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    kind: Mapped[str] = mapped_column(String, index=True)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


def database(url=None):
    engine = create_engine(url or os.getenv("DATABASE_URL", "sqlite:///agentguard.db"))
    Base.metadata.create_all(engine)
    return engine


def save(engine, kind, payload, identifier=None):
    identifier = identifier or uuid4().hex
    with Session(engine) as session:
        session.merge(Record(id=identifier, kind=kind, payload=payload))
        session.commit()
    return identifier


def listing(engine, kind):
    with Session(engine) as session:
        return [
            {**r.payload, "id": r.id}
            for r in session.scalars(select(Record).where(Record.kind == kind))
        ]
