from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import Column
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, Relationship, SQLModel

if TYPE_CHECKING:
    pass


class ResearchSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    original_prompt: str
    status: str = Field(default="pending", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    final_synthesis: Optional[str] = None

    branches: List["ResearchBranch"] = Relationship(back_populates="session", sa_relationship_kwargs={"lazy": "selectin"})
    logs: List["AgentLog"] = Relationship(back_populates="session", sa_relationship_kwargs={"lazy": "selectin"})
    knowledge_facts: List["KnowledgeFact"] = Relationship(back_populates="session", sa_relationship_kwargs={"lazy": "selectin"})


class ResearchBranch(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="researchsession.id", index=True)
    name: str
    status: str = Field(default="active", index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    session: Optional["ResearchSession"] = Relationship(back_populates="branches")
    tasks: List["ResearchTask"] = Relationship(back_populates="branch", sa_relationship_kwargs={"lazy": "selectin"})


class ResearchTask(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    branch_id: int = Field(foreign_key="researchbranch.id", index=True)

    description: str
    assigned_to: str
    status: str = Field(default="pending", index=True)
    priority: int = Field(default=5, index=True)

    result: Optional[str] = None
    python_code: Optional[str] = None

    # JSONB fields
    experiment_spec: Optional[dict] = Field(
        default=None, sa_column=Column(JSONB, nullable=True)
    )
    dependencies: Optional[list[str]] = Field(
        default_factory=list, sa_column=Column(JSONB, nullable=False)
    )

    created_at: datetime = Field(default_factory=datetime.utcnow)

    branch: Optional[ResearchBranch] = Relationship(back_populates="tasks")


class AgentLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="researchsession.id", index=True)

    agent_name: str
    message: str
    type: str = Field(default="info", index=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)

    session: Optional[ResearchSession] = Relationship(back_populates="logs")


class KnowledgeFact(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="researchsession.id", index=True)

    content: str
    source_agent: str
    confidence: int = Field(default=50)

    created_at: datetime = Field(default_factory=datetime.utcnow)

    session: Optional[ResearchSession] = Relationship(back_populates="knowledge_facts")


