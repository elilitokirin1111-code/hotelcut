"""Typed contracts for queued media analysis."""

from pydantic import BaseModel, ConfigDict, Field


class AnalysisJobData(BaseModel):
    """Language-neutral payload published by the API."""

    model_config = ConfigDict(extra="forbid")

    analysisJobId: str
    assetId: str
    hotelId: str
    storageBucket: str
    storageKey: str
    expectedChecksumSha256: str = Field(pattern=r"^[0-9A-Fa-f]{64}$")
    pipelineVersion: str


class VideoProbe(BaseModel):
    """Normalized ffprobe output persisted in Asset.metadata."""

    durationMs: int = Field(gt=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    frameRate: float = Field(gt=0)
    videoCodec: str
    audioCodec: str | None
    audioChannels: int | None
    rotation: int = 0


class TranscriptWord(BaseModel):
    startMs: int = Field(ge=0)
    endMs: int = Field(gt=0)
    text: str
    probability: float = Field(ge=0, le=1)


class TranscriptSegment(BaseModel):
    startMs: int = Field(ge=0)
    endMs: int = Field(gt=0)
    text: str
    words: list[TranscriptWord]


class TranscriptResult(BaseModel):
    text: str
    language: str | None
    segments: list[TranscriptSegment]
    vad: list[tuple[int, int]]


class SceneRange(BaseModel):
    startMs: int = Field(ge=0)
    endMs: int = Field(gt=0)
