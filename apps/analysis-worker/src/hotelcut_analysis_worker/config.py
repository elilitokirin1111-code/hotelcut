"""Runtime configuration."""

from pydantic import RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated analysis worker environment."""

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

    ANALYSIS_WORKER_HOST: str = "0.0.0.0"
    ANALYSIS_WORKER_PORT: int = 8001
    REDIS_URL: RedisDsn = RedisDsn("redis://localhost:6379")
