import os
from functools import lru_cache

from dotenv import load_dotenv


load_dotenv()


class Settings:
    PROJECT_NAME: str = "Research Colossus Backend"
    GEMINI_API_KEY: str | None = os.getenv("GEMINI_API_KEY")

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://postgres:postgres@localhost:5432/research_colossus",
    )

    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    CELERY_BROKER_URL: str = os.getenv("CELERY_BROKER_URL", REDIS_URL)
    CELERY_RESULT_BACKEND: str = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)


@lru_cache
def get_settings() -> Settings:
    return Settings()


