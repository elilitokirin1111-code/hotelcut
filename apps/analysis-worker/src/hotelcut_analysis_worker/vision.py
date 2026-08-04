"""OpenAI multimodal footage understanding with a no-key fallback."""

from __future__ import annotations

import base64
import hashlib
from pathlib import Path
from typing import Any, Protocol, cast

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.models import (
    VisionAnalysis,
    VisionFrame,
    VisionModelOutput,
    VisionSceneAnalysis,
    VisionTag,
    VisionUsage,
)

PROMPT_VERSION = "hotel-video-vision-v1"

SYSTEM_PROMPT = """You are a senior editor selecting footage for Chinese hotel short videos.
Analyze each supplied image as the representative frame for its stated scene range.

Success criteria:
- classify hotel scenes conservatively; never claim an amenity or selling point not visible
- use only the schema's English tags and choose tags useful for automatic shot matching
- score editorial usability, composition, focus, exposure, cleanliness, and visual appeal
- mark black, severely blurred, obstructed, duplicate-looking, or unusable scenes as unusable
- return exactly one scene result for every supplied sceneIndex
- write summary, description, sellingPoints, and issues in Simplified Chinese

Use room for bedrooms and guest-room interiors, bathroom for toilets/showers/sinks,
exterior for facade/entrance/signage, facility for pools/gyms/restaurants/public amenities,
detail for close-ups of design or amenities, service for visible staff/service actions,
lobby for reception/public lobby, promotion only when a visible offer is present, and host
only when a person is clearly presenting to camera. Stop after producing the schema."""


class VisualAnalyzer(Protocol):
    """Provider boundary for semantic footage analysis."""

    enabled: bool

    def analyze(self, frames: list[VisionFrame], tenant_id: str) -> VisionAnalysis:
        """Analyze representative scene frames without persisting image payloads."""


class DisabledVisualAnalyzer:
    """No-network fallback used when the provider or API key is unavailable."""

    enabled = False

    def analyze(self, frames: list[VisionFrame], tenant_id: str) -> VisionAnalysis:
        del frames, tenant_id
        return VisionAnalysis.disabled(PROMPT_VERSION)


def _data_url(path: Path) -> str:
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def _safety_identifier(tenant_id: str) -> str:
    digest = hashlib.sha256(tenant_id.encode("utf-8")).hexdigest()
    return f"hotel_{digest[:32]}"


def _usage_value(usage: Any, name: str) -> int:
    value = getattr(usage, name, 0) if usage is not None else 0
    return int(value) if isinstance(value, int) else 0


def _deduplicate(values: list[VisionTag]) -> list[VisionTag]:
    return list(dict.fromkeys(values))


def _normalized_scene(scene: VisionSceneAnalysis) -> VisionSceneAnalysis:
    tags = list(scene.tags)
    category_tags: dict[str, list[VisionTag]] = {
        "exterior": ["exterior"],
        "lobby": ["lobby"],
        "room": ["room"],
        "bathroom": ["bathroom"],
        "facility": ["facility"],
        "detail": ["detail"],
        "service": ["service"],
        "promotion": ["promotion"],
        "food": ["facility", "restaurant"],
        "host": ["host", "presenter"],
        "other": [],
    }
    tags.extend(category_tags[scene.category])
    return scene.model_copy(update={"tags": _deduplicate(tags)[:12]})


class OpenAIVisualAnalyzer:
    """Responses API adapter using image input and strict structured output."""

    enabled = True

    def __init__(self, settings: Settings, *, client: Any | None = None) -> None:
        self._settings = settings
        if client is not None:
            self._client = client
            return

        from openai import OpenAI

        key = settings.OPENAI_API_KEY
        if key is None or not key.get_secret_value():
            raise ValueError("openai_api_key_missing")
        self._client = OpenAI(
            api_key=key.get_secret_value(),
            base_url=settings.OPENAI_BASE_URL or None,
            max_retries=settings.OPENAI_VISION_MAX_RETRIES,
            timeout=settings.OPENAI_VISION_TIMEOUT_SECONDS,
        )

    def analyze(self, frames: list[VisionFrame], tenant_id: str) -> VisionAnalysis:
        if not frames:
            return VisionAnalysis.disabled(PROMPT_VERSION)

        content: list[dict[str, object]] = [
            {
                "type": "input_text",
                "text": (
                    f"Analyze {len(frames)} ordered hotel-video scenes. "
                    "The text before each image identifies the required sceneIndex."
                ),
            }
        ]
        for frame in frames:
            content.extend(
                [
                    {
                        "type": "input_text",
                        "text": (
                            f"sceneIndex={frame.sceneIndex}; rangeMs={frame.startMs}-{frame.endMs}"
                        ),
                    },
                    {
                        "type": "input_image",
                        "image_url": _data_url(frame.imagePath),
                        "detail": self._settings.OPENAI_VISION_DETAIL,
                    },
                ]
            )

        response = self._client.responses.create(
            model=self._settings.OPENAI_VISION_MODEL,
            instructions=SYSTEM_PROMPT,
            input=[{"role": "user", "content": content}],
            reasoning={"effort": self._settings.OPENAI_VISION_REASONING_EFFORT},
            max_output_tokens=self._settings.OPENAI_VISION_MAX_OUTPUT_TOKENS,
            safety_identifier=_safety_identifier(tenant_id),
            store=False,
            text={
                "format": {
                    "type": "json_schema",
                    "name": "hotel_video_vision_analysis",
                    "strict": True,
                    "schema": VisionModelOutput.model_json_schema(),
                }
            },
        )
        if getattr(response, "status", None) != "completed":
            raise RuntimeError("openai_vision_incomplete")
        output_text = getattr(response, "output_text", "")
        if not isinstance(output_text, str) or not output_text.strip():
            raise RuntimeError("openai_vision_empty_output")

        output = VisionModelOutput.model_validate_json(output_text)
        expected_indices = {frame.sceneIndex for frame in frames}
        actual_indices = [scene.sceneIndex for scene in output.scenes]
        if set(actual_indices) != expected_indices or len(actual_indices) != len(expected_indices):
            raise RuntimeError("openai_vision_scene_contract_mismatch")

        order = {frame.sceneIndex: index for index, frame in enumerate(frames)}
        scenes = sorted(
            (_normalized_scene(scene) for scene in output.scenes),
            key=lambda scene: order[scene.sceneIndex],
        )
        overall_tags = _deduplicate(
            [*output.tags, *[tag for scene in scenes if scene.usable for tag in scene.tags]]
        )
        usage = getattr(response, "usage", None)
        return VisionAnalysis(
            status="succeeded",
            provider="openai",
            promptVersion=PROMPT_VERSION,
            model=str(getattr(response, "model", self._settings.OPENAI_VISION_MODEL)),
            responseId=cast(str | None, getattr(response, "id", None)),
            summary=output.summary,
            tags=overall_tags,
            sellingPoints=output.sellingPoints,
            qualityScore=output.qualityScore,
            scenes=scenes,
            usage=VisionUsage(
                inputTokens=_usage_value(usage, "input_tokens"),
                outputTokens=_usage_value(usage, "output_tokens"),
                totalTokens=_usage_value(usage, "total_tokens"),
            ),
            errorCode=None,
        )


def vision_is_configured(settings: Settings) -> bool:
    key = settings.OPENAI_API_KEY
    return (
        settings.OPENAI_VISION_PROVIDER == "openai"
        and key is not None
        and bool(key.get_secret_value())
    )


def create_visual_analyzer(settings: Settings) -> VisualAnalyzer:
    """Enable OpenAI automatically when configured, otherwise preserve local operation."""

    if not vision_is_configured(settings):
        return DisabledVisualAnalyzer()
    return OpenAIVisualAnalyzer(settings)
