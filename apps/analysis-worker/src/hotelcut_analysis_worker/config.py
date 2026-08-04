"""Runtime configuration."""

from typing import Literal

from pydantic import Field, RedisDsn, SecretStr
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
    OPENAI_API_KEY: SecretStr | None = None
    OPENAI_BASE_URL: str | None = None
    OPENAI_VISION_PROVIDER: Literal["openai", "disabled"] = "openai"
    OPENAI_VISION_MODEL: str = "gpt-5.6-terra"
    OPENAI_VISION_DETAIL: Literal["low", "high", "original"] = "high"
    OPENAI_VISION_REASONING_EFFORT: Literal["none", "low", "medium", "high"] = "medium"
    OPENAI_VISION_MAX_FRAMES: int = Field(default=8, ge=1, le=12)
    OPENAI_VISION_MAX_OUTPUT_TOKENS: int = Field(default=2_048, ge=512, le=8_192)
    OPENAI_VISION_TIMEOUT_SECONDS: float = Field(default=120, ge=10, le=300)
    OPENAI_VISION_MAX_RETRIES: int = Field(default=2, ge=0, le=5)
    OPENAI_VISION_REQUIRED: bool = False
    WHISPER_COMPUTE_TYPE: str = "int8"
    WHISPER_DEVICE: str = "cpu"
    WHISPER_MODEL: str = "tiny"
