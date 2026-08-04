from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any, cast

import httpx
import pytest
from openai import OpenAI

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.model_provider import ModelProviderConfiguration
from hotelcut_analysis_worker.models import VisionFrame, VisionModelOutput
from hotelcut_analysis_worker.vision import (
    DisabledVisualAnalyzer,
    OpenAIVisualAnalyzer,
    create_visual_analyzer,
    vision_is_configured,
)


class RecordingResponses:
    def __init__(self, output: dict[str, object]) -> None:
        self.arguments: dict[str, Any] | None = None
        self._output = output

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.arguments = kwargs
        return SimpleNamespace(
            id="resp_hotelcut_test",
            model="gpt-5.6-terra-2026-07-01",
            output_text=json.dumps(self._output, ensure_ascii=False),
            status="completed",
            usage=SimpleNamespace(input_tokens=640, output_tokens=180, total_tokens=820),
        )


class RecordingClient:
    def __init__(self, output: dict[str, object]) -> None:
        self.responses = RecordingResponses(output)


class RecordingChatCompletions:
    def __init__(self, output: dict[str, object]) -> None:
        self.arguments: dict[str, Any] | None = None
        self._output = output

    def create(self, **kwargs: Any) -> SimpleNamespace:
        self.arguments = kwargs
        return SimpleNamespace(
            id="chatcmpl_bailian_test",
            model="qwen3.7-plus",
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=json.dumps(self._output, ensure_ascii=False),
                    )
                )
            ],
            usage=SimpleNamespace(prompt_tokens=700, completion_tokens=160, total_tokens=860),
        )


class RecordingChatClient:
    def __init__(self, output: dict[str, object]) -> None:
        self.completions = RecordingChatCompletions(output)
        self.chat = SimpleNamespace(completions=self.completions)


def _output(scene_index: int = 1) -> dict[str, object]:
    return {
        "summary": "明亮整洁的酒店客房, 适合展示空间与窗景。",
        "tags": ["room", "bright", "window"],
        "sellingPoints": ["自然采光", "宽敞客房"],
        "qualityScore": 89,
        "scenes": [
            {
                "sceneIndex": scene_index,
                "category": "room",
                "tags": ["bright", "window", "clean"],
                "description": "明亮整洁的客房全景",
                "sellingPoints": ["落地窗采光"],
                "issues": [],
                "qualityScore": 92,
                "confidenceScore": 96,
                "usable": True,
            }
        ],
    }


def test_openai_vision_uses_images_strict_schema_privacy_and_usage(tmp_path: Path) -> None:
    image = tmp_path / "scene.jpg"
    image.write_bytes(b"jpeg-test-payload")
    client = RecordingClient(_output())
    analyzer = OpenAIVisualAnalyzer(
        Settings(OPENAI_VISION_MODEL="gpt-5.6-terra"),
        client=client,
    )

    result = analyzer.analyze(
        [VisionFrame(sceneIndex=1, startMs=0, endMs=5_000, imagePath=image)],
        "30000000-0000-4000-8000-000000000001",
    )

    assert result.status == "succeeded"
    assert result.model == "gpt-5.6-terra-2026-07-01"
    assert result.usage is not None and result.usage.totalTokens == 820
    assert result.scenes[0].tags == ["bright", "window", "clean", "room"]
    arguments = client.responses.arguments
    assert arguments is not None
    assert arguments["store"] is False
    assert arguments["reasoning"] == {"effort": "medium"}
    assert str(arguments["safety_identifier"]).startswith("hotel_")
    assert "30000000-0000-4000-8000-000000000001" not in str(arguments["safety_identifier"])
    text_format = arguments["text"]["format"]
    assert text_format["strict"] is True
    assert text_format["schema"]["additionalProperties"] is False
    content = arguments["input"][0]["content"]
    image_inputs = [entry for entry in content if entry["type"] == "input_image"]
    assert image_inputs == [
        {
            "type": "input_image",
            "image_url": "data:image/jpeg;base64,anBlZy10ZXN0LXBheWxvYWQ=",
            "detail": "high",
        }
    ]


def test_openai_vision_rejects_scene_index_drift(tmp_path: Path) -> None:
    image = tmp_path / "scene.jpg"
    image.write_bytes(b"jpeg")
    analyzer = OpenAIVisualAnalyzer(Settings(), client=RecordingClient(_output(scene_index=2)))

    with pytest.raises(RuntimeError, match="openai_vision_scene_contract_mismatch"):
        analyzer.analyze(
            [VisionFrame(sceneIndex=1, startMs=0, endMs=1_000, imagePath=image)],
            "hotel-1",
        )


def test_bailian_vision_uses_chat_image_urls_and_json_mode(tmp_path: Path) -> None:
    image = tmp_path / "scene.jpg"
    image.write_bytes(b"bailian-jpeg")
    client = RecordingChatClient(_output())
    configuration = ModelProviderConfiguration(
        provider="aliyun-bailian",
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_mode="chat_completions",
        model="qwen3.7-plus",
        reasoning_effort="none",
        api_key="sk-bailian-test-key",
    )
    analyzer = OpenAIVisualAnalyzer(Settings(), configuration, client=client)

    result = analyzer.analyze(
        [VisionFrame(sceneIndex=1, startMs=0, endMs=5_000, imagePath=image)],
        "hotel-1",
    )

    assert result.provider == "aliyun-bailian"
    assert result.model == "qwen3.7-plus"
    assert result.usage is not None and result.usage.totalTokens == 860
    arguments = client.completions.arguments
    assert arguments is not None
    assert arguments["response_format"] == {"type": "json_object"}
    assert arguments["extra_body"] == {"enable_thinking": False}
    assert "max_tokens" not in arguments
    messages = cast(list[dict[str, Any]], arguments["messages"])
    assert "JSON Schema" in messages[0]["content"]
    content = cast(list[dict[str, Any]], messages[1]["content"])
    image_inputs = [entry for entry in content if entry["type"] == "image_url"]
    assert image_inputs == [
        {
            "type": "image_url",
            "image_url": {"url": "data:image/jpeg;base64,YmFpbGlhbi1qcGVn"},
        }
    ]


def test_visual_analyzer_is_disabled_without_api_key() -> None:
    settings = Settings(OPENAI_API_KEY=None, OPENAI_VISION_PROVIDER="openai")

    assert vision_is_configured(settings) is False
    assert isinstance(create_visual_analyzer(settings), DisabledVisualAnalyzer)


def test_official_sdk_serializes_the_production_responses_contract(tmp_path: Path) -> None:
    image = tmp_path / "scene.jpg"
    image.write_bytes(b"jpeg")
    captured: dict[str, object] = {}

    def handle(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "id": "resp_contract_test",
                "object": "response",
                "created_at": 1_786_000_000,
                "status": "completed",
                "completed_at": 1_786_000_001,
                "error": None,
                "incomplete_details": None,
                "instructions": None,
                "max_output_tokens": 2_048,
                "model": "gpt-5.6-terra-2026-07-01",
                "output": [
                    {
                        "type": "message",
                        "id": "msg_contract_test",
                        "status": "completed",
                        "role": "assistant",
                        "content": [
                            {
                                "type": "output_text",
                                "text": json.dumps(_output(), ensure_ascii=False),
                                "annotations": [],
                            }
                        ],
                    }
                ],
                "parallel_tool_calls": True,
                "previous_response_id": None,
                "reasoning": {"effort": "medium", "summary": None},
                "store": False,
                "text": {"format": {"type": "json_schema"}},
                "tool_choice": "auto",
                "tools": [],
                "usage": {
                    "input_tokens": 500,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens": 150,
                    "output_tokens_details": {"reasoning_tokens": 20},
                    "total_tokens": 650,
                },
            },
        )

    sdk = OpenAI(
        api_key="test-api-key",
        http_client=httpx.Client(transport=httpx.MockTransport(handle)),
    )
    analyzer = OpenAIVisualAnalyzer(Settings(), client=sdk)

    result = analyzer.analyze(
        [VisionFrame(sceneIndex=1, startMs=0, endMs=1_000, imagePath=image)],
        "hotel-1",
    )

    assert result.status == "succeeded"
    assert result.usage is not None and result.usage.totalTokens == 650
    assert captured["model"] == "gpt-5.6-terra"
    assert captured["store"] is False
    assert captured["text"] == {
        "format": {
            "name": "hotel_video_vision_analysis",
            "schema": VisionModelOutput.model_json_schema(),
            "strict": True,
            "type": "json_schema",
        }
    }
