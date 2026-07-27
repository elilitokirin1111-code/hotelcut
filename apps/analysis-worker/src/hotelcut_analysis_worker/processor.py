"""Retry-safe media analysis orchestration."""

from __future__ import annotations

import hashlib
import json
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import psycopg
from minio import Minio

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.media_tools import (
    CommandRunner,
    SubprocessCommandRunner,
    create_derivatives,
    detect_scenes,
    probe_video,
)
from hotelcut_analysis_worker.models import AnalysisJobData, SceneRange, TranscriptResult
from hotelcut_analysis_worker.providers import Transcriber, create_transcriber


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


class AnalysisProcessor:
    """Downloads one asset, creates derivatives, and atomically persists results."""

    def __init__(
        self,
        settings: Settings,
        *,
        runner: CommandRunner | None = None,
        transcriber: Transcriber | None = None,
        storage: Minio | None = None,
    ) -> None:
        self._settings = settings
        self._runner = runner or SubprocessCommandRunner()
        self._transcriber = transcriber or create_transcriber(settings)
        endpoint = urlparse(settings.S3_ENDPOINT)
        self._storage = storage or Minio(
            endpoint.netloc,
            access_key=settings.S3_ACCESS_KEY_ID,
            secret_key=settings.S3_SECRET_ACCESS_KEY,
            secure=endpoint.scheme == "https",
        )

    def process(self, data: AnalysisJobData) -> dict[str, str]:
        """Process one BullMQ payload. Re-running the same payload is safe."""

        attempt, max_attempts, already_complete = self._start_attempt(data)
        if already_complete:
            return {"assetId": data.assetId, "status": "already_complete"}

        try:
            with tempfile.TemporaryDirectory(prefix=f"hotelcut-{data.assetId}-") as directory:
                workspace = Path(directory)
                original = workspace / "original"
                proxy = workspace / "proxy.mp4"
                thumbnail = workspace / "thumbnail.jpg"
                audio = workspace / "audio.wav"

                self._log(data.analysisJobId, "info", "Downloading original asset")
                self._storage.fget_object(data.storageBucket, data.storageKey, str(original))
                actual_checksum = _sha256(original)
                if actual_checksum.lower() != data.expectedChecksumSha256.lower():
                    raise ValueError("checksum_mismatch")

                self._log(data.analysisJobId, "info", "Probing video streams")
                probe = probe_video(original, self._runner, self._settings.FFPROBE_PATH)
                self._log(
                    data.analysisJobId,
                    "info",
                    "Creating proxy, thumbnail and analysis audio",
                )
                create_derivatives(
                    original,
                    proxy,
                    thumbnail,
                    audio,
                    probe,
                    self._runner,
                    self._settings.FFMPEG_PATH,
                )
                scenes = detect_scenes(original, probe.durationMs)
                self._log(
                    data.analysisJobId,
                    "info",
                    "Transcribing speech with word timestamps and VAD",
                    {"provider": self._settings.ANALYSIS_TRANSCRIPTION_PROVIDER},
                )
                transcript = self._transcriber.transcribe(audio, probe.durationMs)

                derivative_rows = self._upload_derivatives(
                    data,
                    proxy,
                    thumbnail,
                    audio,
                )
                self._persist_success(
                    data,
                    probe.model_dump(),
                    transcript,
                    scenes,
                    derivative_rows,
                )
                return {"assetId": data.assetId, "status": "ready"}
        except Exception as error:
            self._persist_failure(data, error, attempt, max_attempts)
            raise

    def _connect(self) -> psycopg.Connection[tuple[Any, ...]]:
        return psycopg.connect(self._settings.DATABASE_URL)

    def _start_attempt(self, data: AnalysisJobData) -> tuple[int, int, bool]:
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "select status from analysis_jobs where id = %s and asset_id = %s",
                (data.analysisJobId, data.assetId),
            )
            row = cursor.fetchone()
            if row is None:
                raise ValueError("analysis_job_not_found")
            if row[0] == "succeeded":
                return 0, 0, True
            cursor.execute(
                """
                update analysis_jobs
                set status = 'running', attempt = attempt + 1, started_at = now(),
                    finished_at = null, error_code = null, error_message = null,
                    updated_at = now()
                where id = %s
                returning attempt, max_attempts
                """,
                (data.analysisJobId,),
            )
            attempt_row = cursor.fetchone()
            if attempt_row is None:
                raise ValueError("analysis_job_not_found")
            cursor.execute(
                "update assets set status = 'analyzing', updated_at = now() where id = %s",
                (data.assetId,),
            )
            return int(attempt_row[0]), int(attempt_row[1]), False

    def _log(
        self,
        analysis_job_id: str,
        level: str,
        message: str,
        details: dict[str, object] | None = None,
    ) -> None:
        entry: dict[str, object] = {"at": _now(), "level": level, "message": message}
        if details is not None:
            entry["details"] = details
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update analysis_jobs
                set logs = logs || %s::jsonb, updated_at = now()
                where id = %s
                """,
                (json.dumps([entry], ensure_ascii=False), analysis_job_id),
            )

    def _upload_derivatives(
        self,
        data: AnalysisJobData,
        proxy: Path,
        thumbnail: Path,
        audio: Path,
    ) -> list[dict[str, object]]:
        definitions = [
            ("proxy", proxy, "video/mp4"),
            ("thumbnail", thumbnail, "image/jpeg"),
            ("audio", audio, "audio/wav"),
        ]
        rows: list[dict[str, object]] = []
        for kind, path, content_type in definitions:
            key = f"hotels/{data.hotelId}/assets/{data.assetId}/derived/{path.name}"
            self._storage.fput_object(
                data.storageBucket,
                key,
                str(path),
                content_type=content_type,
            )
            rows.append(
                {
                    "kind": kind,
                    "bucket": data.storageBucket,
                    "key": key,
                    "contentType": content_type,
                    "byteSize": path.stat().st_size,
                    "checksumSha256": _sha256(path),
                }
            )
        return rows

    def _persist_success(
        self,
        data: AnalysisJobData,
        probe: dict[str, object],
        transcript: TranscriptResult,
        scenes: list[SceneRange],
        derivatives: list[dict[str, object]],
    ) -> None:
        metadata = {
            "analysis": {"completedAt": _now(), "pipelineVersion": data.pipelineVersion},
            "probe": probe,
            "transcript": transcript.model_dump(),
        }
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                "delete from asset_segments where asset_id = %s and source = 'automatic'",
                (data.assetId,),
            )
            for index, scene in enumerate(scenes, start=1):
                cursor.execute(
                    """
                    insert into asset_segments (
                        id, asset_id, start_ms, end_ms, label, kind, source, metadata
                    ) values (%s, %s, %s, %s, %s, 'scene', 'automatic', '{}'::jsonb)
                    """,
                    (
                        str(uuid.uuid4()),
                        data.assetId,
                        scene.startMs,
                        scene.endMs,
                        f"Scene {index}",
                    ),
                )
            for segment in transcript.segments:
                cursor.execute(
                    """
                    insert into asset_segments (
                        id, asset_id, start_ms, end_ms, label, kind, source, metadata
                    ) values (%s, %s, %s, %s, %s, 'speech', 'automatic', %s::jsonb)
                    """,
                    (
                        str(uuid.uuid4()),
                        data.assetId,
                        segment.startMs,
                        segment.endMs,
                        segment.text[:160],
                        json.dumps(
                            {
                                "text": segment.text,
                                "words": [word.model_dump() for word in segment.words],
                            },
                            ensure_ascii=False,
                        ),
                    ),
                )
            for start_ms, end_ms in transcript.vad:
                cursor.execute(
                    """
                    insert into asset_segments (
                        id, asset_id, start_ms, end_ms, label, kind, source, metadata
                    ) values (%s, %s, %s, %s, 'speech', 'vad', 'automatic', '{}'::jsonb)
                    """,
                    (str(uuid.uuid4()), data.assetId, start_ms, max(end_ms, start_ms + 1)),
                )
            for derivative in derivatives:
                cursor.execute(
                    """
                    insert into asset_derivatives (
                        id, asset_id, kind, storage_bucket, storage_key,
                        content_type, byte_size, checksum_sha256
                    ) values (%s, %s, %s, %s, %s, %s, %s, %s)
                    on conflict (asset_id, kind) do update set
                        storage_bucket = excluded.storage_bucket,
                        storage_key = excluded.storage_key,
                        content_type = excluded.content_type,
                        byte_size = excluded.byte_size,
                        checksum_sha256 = excluded.checksum_sha256,
                        updated_at = now()
                    """,
                    (
                        str(uuid.uuid4()),
                        data.assetId,
                        derivative["kind"],
                        derivative["bucket"],
                        derivative["key"],
                        derivative["contentType"],
                        derivative["byteSize"],
                        derivative["checksumSha256"],
                    ),
                )
            cursor.execute(
                """
                update assets
                set status = 'ready', metadata = %s::jsonb, updated_at = now()
                where id = %s
                """,
                (json.dumps(metadata, ensure_ascii=False), data.assetId),
            )
            success_log = json.dumps(
                [{"at": _now(), "level": "info", "message": "Analysis completed"}],
                ensure_ascii=False,
            )
            cursor.execute(
                """
                update analysis_jobs
                set status = 'succeeded', logs = logs || %s::jsonb, finished_at = now(),
                    updated_at = now()
                where id = %s
                """,
                (success_log, data.analysisJobId),
            )

    def _persist_failure(
        self,
        data: AnalysisJobData,
        error: Exception,
        attempt: int,
        max_attempts: int,
    ) -> None:
        final = attempt >= max_attempts
        job_status = "failed" if final else "queued"
        asset_status = "failed" if final else "uploaded"
        error_code = str(error) if str(error).isidentifier() else type(error).__name__
        log = json.dumps(
            [
                {
                    "at": _now(),
                    "level": "error" if final else "warning",
                    "message": "Analysis attempt failed",
                    "details": {"attempt": attempt, "error": str(error)},
                }
            ],
            ensure_ascii=False,
        )
        with self._connect() as connection, connection.cursor() as cursor:
            cursor.execute(
                """
                update analysis_jobs
                set status = %s::analysis_job_status, logs = logs || %s::jsonb,
                    error_code = %s, error_message = %s,
                    finished_at = case when %s then now() else null end,
                    updated_at = now()
                where id = %s
                """,
                (
                    job_status,
                    log,
                    error_code[:100],
                    str(error),
                    final,
                    data.analysisJobId,
                ),
            )
            cursor.execute(
                "update assets set status = %s::asset_status, updated_at = now() where id = %s",
                (asset_status, data.assetId),
            )
