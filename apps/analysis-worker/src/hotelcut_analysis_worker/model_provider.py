"""Resolve per-hotel model settings and decrypt server-side API keys."""

from __future__ import annotations

import base64
import hashlib
from dataclasses import dataclass
from typing import Any, Literal, cast

import psycopg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from hotelcut_analysis_worker.config import Settings

type ModelProvider = Literal["openai", "openai-compatible", "aliyun-bailian"]
type ModelApiMode = Literal["responses", "chat_completions"]
type ReasoningEffort = Literal["none", "low", "medium", "high", "xhigh", "max"]

INVALID_MODELS = {"", "无", "none", "null", "undefined"}


@dataclass(frozen=True, slots=True)
class ModelProviderConfiguration:
    """Decrypted provider settings used for one analysis request."""

    provider: ModelProvider
    base_url: str
    api_mode: ModelApiMode
    model: str
    reasoning_effort: ReasoningEffort
    api_key: str


def _decode_base64url(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def decrypt_model_api_key(value: str, secret: str) -> str:
    """Decrypt the AES-256-GCM envelope produced by the Node API."""

    parts = value.split(".")
    if len(parts) != 4 or parts[0] != "v1" or not all(parts[1:]):
        raise ValueError("MODEL_API_KEY_FORMAT_INVALID")
    _, encoded_iv, encoded_tag, encoded_ciphertext = parts
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    plaintext = AESGCM(key).decrypt(
        _decode_base64url(encoded_iv),
        _decode_base64url(encoded_ciphertext) + _decode_base64url(encoded_tag),
        None,
    )
    return plaintext.decode("utf-8")


def environment_provider_configuration(
    settings: Settings,
) -> ModelProviderConfiguration | None:
    """Preserve the legacy environment-level OpenAI configuration as a fallback."""

    key = settings.OPENAI_API_KEY
    if settings.OPENAI_VISION_PROVIDER != "openai" or key is None or not key.get_secret_value():
        return None
    return ModelProviderConfiguration(
        provider="openai",
        base_url=settings.OPENAI_BASE_URL or "https://api.openai.com/v1",
        api_mode="responses",
        model=settings.OPENAI_VISION_MODEL,
        reasoning_effort=settings.OPENAI_VISION_REASONING_EFFORT,
        api_key=key.get_secret_value(),
    )


def configuration_from_row(
    settings: Settings,
    row: tuple[Any, ...],
) -> ModelProviderConfiguration | None:
    """Validate and normalize one model_provider_settings database row."""

    (
        provider_value,
        base_url_value,
        api_mode_value,
        model_value,
        reasoning_value,
        encrypted,
        enabled,
    ) = row
    if not bool(enabled) or not isinstance(encrypted, str) or not encrypted:
        return None

    base_url = str(base_url_value).rstrip("/")
    is_bailian = provider_value == "aliyun-bailian" or any(
        hostname in base_url for hostname in ("dashscope.aliyuncs.com", ".maas.aliyuncs.com")
    )
    provider: ModelProvider = (
        "aliyun-bailian" if is_bailian else cast(ModelProvider, provider_value)
    )
    if provider not in ("openai", "openai-compatible", "aliyun-bailian"):
        raise ValueError("model_provider_invalid")

    api_mode: ModelApiMode = (
        "chat_completions" if is_bailian else cast(ModelApiMode, api_mode_value)
    )
    if api_mode not in ("responses", "chat_completions"):
        raise ValueError("model_api_mode_invalid")

    model = str(model_value).strip()
    if is_bailian and model.lower() in INVALID_MODELS:
        model = "qwen3.7-plus"
    if model.lower() in INVALID_MODELS:
        raise ValueError("model_name_invalid")

    reasoning_effort = "none" if is_bailian else cast(ReasoningEffort, reasoning_value)
    if reasoning_effort not in ("none", "low", "medium", "high", "xhigh", "max"):
        raise ValueError("model_reasoning_effort_invalid")

    return ModelProviderConfiguration(
        provider=provider,
        base_url=base_url,
        api_mode=api_mode,
        model=model,
        reasoning_effort=reasoning_effort,
        api_key=decrypt_model_api_key(
            encrypted,
            settings.MODEL_API_CONFIG_SECRET.get_secret_value(),
        ),
    )


class ModelProviderResolver:
    """Read the latest per-hotel provider settings for every analysis job."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    def resolve(self, hotel_id: str) -> ModelProviderConfiguration | None:
        with (
            psycopg.connect(self._settings.DATABASE_URL) as connection,
            connection.cursor() as cursor,
        ):
            cursor.execute(
                """
                select provider, base_url, api_mode, model, reasoning_effort,
                       encrypted_api_key, enabled
                from model_provider_settings
                where hotel_id = %s
                """,
                (hotel_id,),
            )
            row = cursor.fetchone()
        if row is None:
            return environment_provider_configuration(self._settings)
        return configuration_from_row(self._settings, row)
