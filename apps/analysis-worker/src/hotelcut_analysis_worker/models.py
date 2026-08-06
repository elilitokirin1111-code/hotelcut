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
    "welcome",
    "booking",
    "food",
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
    "towel",
    "mirror",
    "desk",
    "marble",
    "warm",
]


class VisionFrame(BaseModel):
    """One representative image sampled from a detected scene."""

    model_config = ConfigDict(extra="forbid")

    sceneIndex: int = Field(ge=1)
    startMs: int = Field(ge=0)
    endMs: int = Field(gt=0)
    imagePath: Path


VisionAngle = Literal[
    "wide",
    "medium",
    "closeup",
    "detail",
    "top-down",
    "low-angle",
]

VisionCameraMotion = Literal[
    "static",
    "pan",
    "tilt",
    "handheld",
    "drone",
    "zoom",
    "push-in",
    "tracking",
]

VisionLighting = Literal[
    "bright",
    "warm",
    "natural",
    "low-light",
    "night",
    "backlit",
]

VisionComposition = Literal[
    "centered",
    "rule-of-thirds",
    "symmetry",
    "diagonal",
    "frame-in-frame",
    "leading-lines",
]


class VisionShotDetails(BaseModel):
    """Per-scene photographic dimensions used for richer asset matching."""

    model_config = ConfigDict(extra="forbid")

    angle: VisionAngle
    cameraMotion: VisionCameraMotion
    lighting: VisionLighting
    composition: VisionComposition
    subjects: list[str] = Field(max_length=6)
    recommendedTemplateTags: list[VisionTag] = Field(max_length=8)


class VisionSceneAnalysis(BaseModel):
    """Structured editorial judgment for one detected scene."""

    model_config = ConfigDict(extra="forbid")

    sceneIndex: int = Field(ge=1)
    shortName: str = Field(max_length=14)
    category: VisionCategory
    tags: list[VisionTag] = Field(max_length=12)
    shot: VisionShotDetails
    description: str = Field(max_length=240)
    sellingPoints: list[str] = Field(max_length=5)
    issues: list[str] = Field(max_length=5)
    qualityScore: int = Field(ge=0, le=100)
    confidenceScore: int = Field(ge=0, le=100)
    usable: bool


class VisionModelOutput(BaseModel):
    """Exact schema requested from the multimodal model."""

    model_config = ConfigDict(extra="forbid")

    shortName: str = Field(max_length=20)
    summary: str = Field(max_length=500)
    tags: list[VisionTag] = Field(max_length=20)
    sellingPoints: list[str] = Field(max_length=8)
    qualityScore: int = Field(ge=0, le=100)
    scenes: list[VisionSceneAnalysis]


class VisionUsage(BaseModel):
    inputTokens: int = Field(ge=0)
    outputTokens: int = Field(ge=0)
    totalTokens: int = Field(ge=0)


type VisionProvider = Literal[
    "openai",
    "openai-compatible",
    "aliyun-bailian",
    "disabled",
]


class VisionAnalysis(BaseModel):
    """Persisted provider result, including safe operational metadata."""

    model_config = ConfigDict(extra="forbid")

    status: Literal["succeeded", "disabled", "failed"]
    provider: VisionProvider
    promptVersion: str
    model: str | None
    responseId: str | None
    shortName: str = Field(default="", max_length=20)
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
            shortName="",
            summary="",
            tags=[],
            sellingPoints=[],
            qualityScore=None,
            scenes=[],
            usage=None,
            errorCode=None,
        )

    @classmethod
    def failed(
        cls,
        prompt_version: str,
        model: str,
        error_code: str,
        provider: VisionProvider = "openai",
    ) -> "VisionAnalysis":
        return cls(
            status="failed",
            provider=provider,
            promptVersion=prompt_version,
            model=model,
            responseId=None,
            shortName="",
            summary="",
            tags=[],
            sellingPoints=[],
            qualityScore=None,
            scenes=[],
            usage=None,
            errorCode=error_code,
        )
