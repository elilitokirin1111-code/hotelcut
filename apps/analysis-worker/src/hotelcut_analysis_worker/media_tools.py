"""Safe FFmpeg, ffprobe and PySceneDetect adapters."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Sequence
from fractions import Fraction
from pathlib import Path
from typing import Any, Protocol, cast

from hotelcut_analysis_worker.models import AudioProbe, SceneRange, VideoProbe


class CommandRunner(Protocol):
    """Runs argument arrays without invoking a command shell."""

    def run(self, arguments: Sequence[str]) -> subprocess.CompletedProcess[str]:
        """Run a media command and return captured output."""


class SubprocessCommandRunner:
    """Production media command runner."""

    def run(self, arguments: Sequence[str]) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            list(arguments),
            check=True,
            capture_output=True,
            text=True,
            timeout=600,
        )


def _stream(payload: dict[str, Any], codec_type: str) -> dict[str, Any] | None:
    for candidate in cast(list[dict[str, Any]], payload.get("streams", [])):
        if candidate.get("codec_type") == codec_type:
            return candidate
    return None


def _fraction(value: object) -> float:
    try:
        return float(Fraction(str(value)))
    except (ValueError, ZeroDivisionError):
        return 0


def probe_video(
    input_path: Path,
    runner: CommandRunner,
    ffprobe_path: str,
) -> VideoProbe:
    """Normalize machine-readable ffprobe JSON."""

    completed = runner.run(
        [
            ffprobe_path,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(input_path),
        ]
    )
    payload = cast(dict[str, Any], json.loads(completed.stdout))
    video = _stream(payload, "video")
    if video is None:
        raise ValueError("Uploaded object has no video stream")
    audio = _stream(payload, "audio")
    duration_seconds = float(
        video.get("duration")
        or cast(dict[str, Any], payload.get("format", {})).get("duration")
        or 0
    )
    rotation = int(cast(dict[str, Any], video.get("tags", {})).get("rotate", 0))
    for side_data in cast(list[dict[str, Any]], video.get("side_data_list", [])):
        if "rotation" in side_data:
            rotation = int(side_data["rotation"])
            break
    return VideoProbe(
        durationMs=max(1, round(duration_seconds * 1_000)),
        width=int(video["width"]),
        height=int(video["height"]),
        frameRate=_fraction(video.get("avg_frame_rate") or video.get("r_frame_rate")),
        videoCodec=str(video.get("codec_name") or "unknown"),
        audioCodec=str(audio.get("codec_name")) if audio else None,
        audioChannels=int(audio["channels"]) if audio and audio.get("channels") else None,
        rotation=rotation,
    )


def probe_audio(
    input_path: Path,
    runner: CommandRunner,
    ffprobe_path: str,
) -> AudioProbe:
    """Normalize audio-only ffprobe JSON without requiring a video stream."""

    completed = runner.run(
        [
            ffprobe_path,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(input_path),
        ]
    )
    payload = cast(dict[str, Any], json.loads(completed.stdout))
    audio = _stream(payload, "audio")
    if audio is None:
        raise ValueError("Uploaded object has no audio stream")
    format_data = cast(dict[str, Any], payload.get("format", {}))
    duration_seconds = float(audio.get("duration") or format_data.get("duration") or 0)
    channels = audio.get("channels")
    sample_rate = audio.get("sample_rate")
    bit_rate = audio.get("bit_rate") or format_data.get("bit_rate")
    return AudioProbe(
        durationMs=max(1, round(duration_seconds * 1_000)),
        audioCodec=str(audio.get("codec_name") or "unknown"),
        audioChannels=int(channels) if channels else None,
        sampleRate=int(sample_rate) if sample_rate else None,
        bitRate=int(bit_rate) if bit_rate else None,
    )


def create_derivatives(
    input_path: Path,
    proxy_path: Path,
    thumbnail_path: Path,
    audio_path: Path,
    probe: VideoProbe,
    runner: CommandRunner,
    ffmpeg_path: str,
) -> None:
    """Create deterministic editing proxy, thumbnail and mono analysis audio."""

    runner.run(
        [
            ffmpeg_path,
            "-y",
            "-i",
            str(input_path),
            "-map",
            "0:v:0",
            "-map",
            "0:a?",
            "-vf",
            r"scale=min(720\,iw):-2",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "28",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            str(proxy_path),
        ]
    )
    seek_seconds = min(1.0, probe.durationMs / 2_000)
    runner.run(
        [
            ffmpeg_path,
            "-y",
            "-ss",
            f"{seek_seconds:.3f}",
            "-i",
            str(input_path),
            "-frames:v",
            "1",
            "-vf",
            "scale=480:-2",
            str(thumbnail_path),
        ]
    )
    if probe.audioCodec:
        runner.run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                str(input_path),
                "-vn",
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                str(audio_path),
            ]
        )
    else:
        runner.run(
            [
                ffmpeg_path,
                "-y",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=mono:sample_rate=16000",
                "-t",
                f"{probe.durationMs / 1_000:.3f}",
                "-c:a",
                "pcm_s16le",
                str(audio_path),
            ]
        )


def detect_scenes(input_path: Path, duration_ms: int) -> list[SceneRange]:
    """Detect visual cuts with PySceneDetect's content detector."""

    from scenedetect import ContentDetector, detect

    detected = detect(
        str(input_path),
        ContentDetector(threshold=27.0, min_scene_len=10),
        start_in_scene=True,
    )
    scenes = [
        SceneRange(
            startMs=round(start.get_seconds() * 1_000),
            endMs=max(round(end.get_seconds() * 1_000), round(start.get_seconds() * 1_000) + 1),
        )
        for start, end in detected
    ]
    return scenes or [SceneRange(startMs=0, endMs=duration_ms)]
