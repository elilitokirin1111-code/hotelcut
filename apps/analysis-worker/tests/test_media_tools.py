from __future__ import annotations

import json
import subprocess
from collections.abc import Sequence
from pathlib import Path

from hotelcut_analysis_worker.media_tools import create_derivatives, probe_audio, probe_video
from hotelcut_analysis_worker.models import VideoProbe


class RecordingRunner:
    def __init__(self, probe_payload: dict[str, object] | None = None) -> None:
        self.arguments: list[list[str]] = []
        self._probe_payload = probe_payload

    def run(self, arguments: Sequence[str]) -> subprocess.CompletedProcess[str]:
        captured = list(arguments)
        self.arguments.append(captured)
        return subprocess.CompletedProcess(
            captured,
            0,
            stdout=json.dumps(self._probe_payload) if self._probe_payload else "",
            stderr="",
        )


def test_probe_video_normalizes_ffprobe_json() -> None:
    runner = RecordingRunner(
        {
            "format": {"duration": "2.501"},
            "streams": [
                {
                    "codec_type": "video",
                    "codec_name": "h264",
                    "width": 1080,
                    "height": 1920,
                    "avg_frame_rate": "30000/1001",
                    "side_data_list": [{"rotation": -90}],
                },
                {"codec_type": "audio", "codec_name": "aac", "channels": 2},
            ],
        }
    )

    probe = probe_video(Path("input.mp4"), runner, "ffprobe")

    assert probe.durationMs == 2501
    assert probe.width == 1080
    assert probe.height == 1920
    assert probe.frameRate == 30000 / 1001
    assert probe.videoCodec == "h264"
    assert probe.audioCodec == "aac"
    assert probe.audioChannels == 2
    assert probe.rotation == -90
    assert runner.arguments[0][0] == "ffprobe"


def test_probe_audio_normalizes_audio_only_ffprobe_json() -> None:
    runner = RecordingRunner(
        {
            "format": {"duration": "31.25", "bit_rate": "192000"},
            "streams": [
                {
                    "codec_type": "audio",
                    "codec_name": "mp3",
                    "channels": 2,
                    "sample_rate": "48000",
                }
            ],
        }
    )

    probe = probe_audio(Path("background-music.mp3"), runner, "ffprobe")

    assert probe.durationMs == 31_250
    assert probe.audioCodec == "mp3"
    assert probe.audioChannels == 2
    assert probe.sampleRate == 48_000
    assert probe.bitRate == 192_000


def test_silent_video_generates_analysis_audio_without_an_input_stream() -> None:
    runner = RecordingRunner()
    probe = VideoProbe(
        durationMs=2500,
        width=1080,
        height=1920,
        frameRate=30,
        videoCodec="h264",
        audioCodec=None,
        audioChannels=None,
    )

    create_derivatives(
        Path("input.mp4"),
        Path("proxy.mp4"),
        Path("thumbnail.jpg"),
        Path("audio.wav"),
        probe,
        runner,
        "ffmpeg",
    )

    assert len(runner.arguments) == 3
    assert runner.arguments[2][1:4] == ["-y", "-f", "lavfi"]
    assert "anullsrc=channel_layout=mono:sample_rate=16000" in runner.arguments[2]
    assert "2.500" in runner.arguments[2]
