"""Runtime configuration."""

from typing import Literal

from pydantic import RedisDsn
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Validated analysis worker environment."""

    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

    ANALYSIS_WORKER_HOST: str = "0.0.0.0"
    ANALYSIS_WORKER_PORT: int = 8001
    ANALYSIS_QUEUE_ENABLED: bool = True
    ANALYSIS_QUEUE_NAME: str = "hotelcut-analysis"
    ANALYSIS_TRANSCRIPTION_PROVIDER: Literal["mock", "faster-whisper", "disabled"] = "mock"
    DATABASE_URL: str = "postgresql://hotelcut:hotelcut_local@localhost:5432/hotelcut"
    FFMPEG_PATH: str = "ffmpeg"
    FFPROBE_PATH: str = "ffprobe"
    REDIS_URL: RedisDsn = RedisDsn("redis://localhost:6379")
    S3_ACCESS_KEY_ID: str = "hotelcut"
    S3_BUCKET: str = "hotelcut-local"
    S3_ENDPOINT: str = "http://localhost:9000"
    S3_SECRET_ACCESS_KEY: str = "hotelcut_local_secret"
    WHISPER_COMPUTE_TYPE: str = "int8"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_MODEL: str = "tiny"
