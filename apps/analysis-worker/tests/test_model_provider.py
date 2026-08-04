from __future__ import annotations

import base64
import hashlib

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import SecretStr

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.model_provider import (
    configuration_from_row,
    decrypt_model_api_key,
)


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _encrypted_api_key(api_key: str, secret: str) -> str:
    iv = bytes(range(12))
    encrypted_and_tag = AESGCM(hashlib.sha256(secret.encode()).digest()).encrypt(
        iv,
        api_key.encode(),
        None,
    )
    ciphertext, tag = encrypted_and_tag[:-16], encrypted_and_tag[-16:]
    return f"v1.{_base64url(iv)}.{_base64url(tag)}.{_base64url(ciphertext)}"


def test_decrypts_node_compatible_model_api_key_envelope() -> None:
    secret = "hotelcut-test-model-secret"
    api_key = "sk-hotelcut-bailian-test-key"

    assert decrypt_model_api_key(_encrypted_api_key(api_key, secret), secret) == api_key


def test_normalizes_legacy_dashscope_settings_and_invalid_model() -> None:
    secret = "hotelcut-test-model-secret"
    api_key = "sk-hotelcut-bailian-test-key"
    settings = Settings(MODEL_API_CONFIG_SECRET=SecretStr(secret))

    configuration = configuration_from_row(
        settings,
        (
            "openai-compatible",
            "https://dashscope.aliyuncs.com/compatible-mode/v1/",
            "responses",
            "无",
            "medium",
            _encrypted_api_key(api_key, secret),
            True,
        ),
    )

    assert configuration is not None
    assert configuration.provider == "aliyun-bailian"
    assert configuration.api_mode == "chat_completions"
    assert configuration.model == "qwen3.7-plus"
    assert configuration.reasoning_effort == "none"
    assert configuration.api_key == api_key
