"""Typed contracts for queued media analysis."""

from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AnalysisJobData(BaseModel):
    """Language-neutral payload published by the API."""

    model_config = ConfigDict(extra="forbid")

    analysisJobId: str
    assetId: str
    assetKind: Literal["video", "audio"]
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


class AudioProbe(BaseModel):
    """Normalized audio-only ffprobe output persisted in Asset.metadata."""

    durationMs: int = Field(gt=0)
    audioCodec: str
    audioChannels: int | None
    sampleRate: int | None
    bitRate: int | None


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


VisionCategory = Literal[
    "exterior",
    "lobby",
    "room",
    "bathroom",
    "facility",
    "detail",
    "service",
    "promotion",
    "food",
    "host",
    "other",
]

VisionTag = Literal[
    "exterior",
    "lobby",
    "room",
    "bathroom",
    "facility",
    "detail",
    "service",
    "promotion",
    "host",
    "presenter",
    "wide",
    "bright",
    "window",
    "clean",
    "day",
    "night",
    "staff",
    "pool",
    "gym",
    "restaurant",
    "breakfast",
    "bed",
    "view",
    "design",
    "amenity",
    "travel",
]


class VisionFrame(BaseModel):
    """One representative image sampled from a detected scene."""

    model_config = ConfigDict(extra="forbid")

    sceneIndex: int = Field(ge=1)
    startMs: int = Field(ge=0)
    endMs: int = Field(gt=0)
    imagePath: Path


class VisionSceneAnalysis(BaseModel):
    """Structured editorial judgment for one detected scene."""

    model_config = ConfigDict(extra="forbid")

    sceneIndex: int = Field(ge=1)
    category: VisionCategory
    tags: list[VisionTag] = Field(max_length=12)
    description: str = Field(max_length=240)
    sellingPoints: list[str] = Field(max_length=5)
    issues: list[str] = Field(max_length=5)
    qualityScore: int = Field(ge=0, le=100)
    confidenceScore: int = Field(ge=0, le=100)
    usable: bool


class VisionModelOutput(BaseModel):
    """Exact schema requested from the multimodal model."""

    model_config = ConfigDict(extra="forbid")

    summary: str = Field(max_length=500)
    tags: list[VisionTag] = Field(max_length=20)
    sellingPoints: list[str] = Field(max_length=8)
    qualityScore: int = Field(ge=0, le=100)
    scenes: list[VisionSceneAnalysis]


class VisionUsage(BaseModel):
    inputTokens: int = Field(ge=0)
    outputTokens: int = Field(ge=0)
    totalTokens: int = Field(ge=0)


class VisionAnalysis(BaseModel):
    """Persisted provider result, including safe operational metadata."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["succeeded", "disabled", "failed"]
    provider: Literal["openai", "disabled"]
    promptVersion: str
    model: str | None
    responseId: str | None
    summary: str
    tags: list[VisionTag]
    sellingPoints: list[str]
    qualityScore: int | None = Field(default=None, ge=0, le=100)
    scenes: list[VisionSceneAnalysis]
    usage: VisionUsage | None
    errorCode: str | None

    @classmethod
    def disabled(cls, prompt_version: str) -> "VisionAnalysis":
        return cls(
            status="disabled",
            provider="disabled",
            promptVersion=prompt_version,
            model=None,
            responseId=None,
            summary="",
            tags=[],
            sellingPoints=[],
            qualityScore=None,
            scenes=[],
            usage=None,
            errorCode=None,
        )

    @classmethod
    def failed(cls, prompt_version: str, model: str, error_code: str) -> "VisionAnalysis":
        return cls(
            status="failed",
            provider="openai",
            promptVersion=prompt_version,
            model=model,
            responseId=None,
            summary="",
            tags=[],
            sellingPoints=[],
            qualityScore=None,
            scenes=[],
            usage=None,
            errorCode=error_code,
        )
