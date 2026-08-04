"""Multimodal hotel-footage understanding with a no-key fallback."""

from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path
from typing import Any, Protocol, cast

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.model_provider import (
    ModelProviderConfiguration,
    environment_provider_configuration,
)
from hotelcut_analysis_worker.models import (
    VisionAnalysis,
    VisionFrame,
    VisionModelOutput,
    VisionProvider,
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
    model: str | None
    provider: VisionProvider

    def analyze(self, frames: list[VisionFrame], tenant_id: str) -> VisionAnalysis:
        """Analyze representative scene frames without persisting image payloads."""


class DisabledVisualAnalyzer:
    """No-network fallback used when the provider or API key is unavailable."""

    enabled = False
    model: str | None = None
    provider: VisionProvider = "disabled"

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
    """OpenAI-compatible multimodal adapter for Responses and Chat Completions."""

    enabled = True
    model: str | None
    provider: VisionProvider

    def __init__(
        self,
        settings: Settings,
        configuration: ModelProviderConfiguration | None = None,
        *,
        client: Any | None = None,
    ) -> None:
        self._settings = settings
        resolved = configuration or environment_provider_configuration(settings)
        if resolved is None and client is not None:
            resolved = ModelProviderConfiguration(
                provider="openai",
                base_url=settings.OPENAI_BASE_URL or "https://api.openai.com/v1",
                api_mode="responses",
                model=settings.OPENAI_VISION_MODEL,
                reasoning_effort=settings.OPENAI_VISION_REASONING_EFFORT,
                api_key="test-api-key",
            )
        if resolved is None:
            raise ValueError("model_provider_api_key_missing")
        self._configuration: ModelProviderConfiguration = resolved
        self.model = self._configuration.model
        self.provider = self._configuration.provider
        if client is not None:
            self._client = client
            return

        from openai import OpenAI

        self._client = OpenAI(
            api_key=self._configuration.api_key,
            base_url=self._configuration.base_url,
            max_retries=settings.OPENAI_VISION_MAX_RETRIES,
            timeout=settings.OPENAI_VISION_TIMEOUT_SECONDS,
        )

    def analyze(self, frames: list[VisionFrame], tenant_id: str) -> VisionAnalysis:
        if not frames:
            return VisionAnalysis.disabled(PROMPT_VERSION)
        if self._configuration.api_mode == "chat_completions":
            return self._analyze_chat(frames)
        return self._analyze_responses(frames, tenant_id)

    def _analyze_responses(
        self,
        frames: list[VisionFrame],
        tenant_id: str,
    ) -> VisionAnalysis:
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
            model=self._configuration.model,
            instructions=SYSTEM_PROMPT,
            input=[{"role": "user", "content": content}],
            reasoning={"effort": self._configuration.reasoning_effort},
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
        return self._build_result(frames, output_text, response)

    def _analyze_chat(self, frames: list[VisionFrame]) -> VisionAnalysis:
        content: list[dict[str, object]] = [
            {
                "type": "text",
                "text": (
                    f"Analyze {len(frames)} ordered hotel-video scenes. "
                    "The text before each image identifies the required sceneIndex. "
                    "Return only valid JSON matching the requested JSON Schema."
                ),
            }
        ]
        for frame in frames:
            content.extend(
                [
                    {
                        "type": "text",
                        "text": (
                            f"sceneIndex={frame.sceneIndex}; rangeMs={frame.startMs}-{frame.endMs}"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": _data_url(frame.imagePath)},
                    },
                ]
            )

        arguments: dict[str, object] = {
            "model": self._configuration.model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        f"{SYSTEM_PROMPT}\nReturn only valid JSON matching this JSON Schema: "
                        f"{json.dumps(VisionModelOutput.model_json_schema())}"
                    ),
                },
                {"role": "user", "content": content},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }
        if self._configuration.provider == "aliyun-bailian":
            arguments["extra_body"] = {"enable_thinking": False}
        response = self._client.chat.completions.create(**arguments)
        choices = getattr(response, "choices", [])
        output_text = (
            getattr(getattr(choices[0], "message", None), "content", "") if choices else ""
        )
        if not isinstance(output_text, str) or not output_text.strip():
            raise RuntimeError("model_vision_empty_output")
        return self._build_result(frames, output_text, response)

    def _build_result(
        self,
        frames: list[VisionFrame],
        output_text: str,
        response: Any,
    ) -> VisionAnalysis:
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
            provider=self._configuration.provider,
            promptVersion=PROMPT_VERSION,
            model=str(getattr(response, "model", self._configuration.model)),
            responseId=cast(str | None, getattr(response, "id", None)),
            summary=output.summary,
            tags=overall_tags,
            sellingPoints=output.sellingPoints,
            qualityScore=output.qualityScore,
            scenes=scenes,
            usage=VisionUsage(
                inputTokens=_usage_value(usage, "input_tokens")
                or _usage_value(usage, "prompt_tokens"),
                outputTokens=_usage_value(usage, "output_tokens")
                or _usage_value(usage, "completion_tokens"),
                totalTokens=_usage_value(usage, "total_tokens"),
            ),
            errorCode=None,
        )


def vision_is_configured(settings: Settings) -> bool:
    return environment_provider_configuration(settings) is not None


def create_visual_analyzer(
    settings: Settings,
    configuration: ModelProviderConfiguration | None = None,
) -> VisualAnalyzer:
    """Create a provider adapter when a browser or environment key is configured."""

    resolved = configuration or environment_provider_configuration(settings)
    if resolved is None:
        return DisabledVisualAnalyzer()
    return OpenAIVisualAnalyzer(settings, resolved)
