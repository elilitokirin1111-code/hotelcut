"""Replaceable transcription providers."""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.models import (
    TranscriptResult,
    TranscriptSegment,
    TranscriptWord,
)


class Transcriber(Protocol):
    """Provider boundary for speech recognition and VAD."""

    def transcribe(self, audio_path: Path, duration_ms: int) -> TranscriptResult:
        """Transcribe an extracted mono WAV file."""


class MockTranscriber:
    """Small deterministic provider used by local and integration environments."""

    def transcribe(self, audio_path: Path, duration_ms: int) -> TranscriptResult:
        del audio_path
        end_ms = max(1, min(duration_ms, 2_000))
        words = [
            TranscriptWord(startMs=0, endMs=max(1, end_ms // 2), text="HotelCut", probability=1),
            TranscriptWord(
                startMs=max(1, end_ms // 2),
                endMs=end_ms,
                text="测试素材",
                probability=1,
            ),
        ]
        segment = TranscriptSegment(
            startMs=0,
            endMs=end_ms,
            text="HotelCut 测试素材",
            words=words,
        )
        return TranscriptResult(
            text=segment.text,
            language="zh",
            segments=[segment],
            vad=[(0, end_ms)],
        )


class DisabledTranscriber:
    """Explicit no-model fallback that leaves media manually usable."""

    def transcribe(self, audio_path: Path, duration_ms: int) -> TranscriptResult:
        del audio_path, duration_ms
        return TranscriptResult(text="", language=None, segments=[], vad=[])


class FasterWhisperTranscriber:
    """CPU-safe faster-whisper adapter with word timestamps and Silero VAD."""

    def __init__(self, settings: Settings) -> None:
        from faster_whisper import WhisperModel

        self._model = WhisperModel(
            settings.WHISPER_MODEL,
            device=settings.WHISPER_DEVICE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
        )

    def transcribe(self, audio_path: Path, duration_ms: int) -> TranscriptResult:
        del duration_ms
        segments_iter, info = self._model.transcribe(
            str(audio_path),
            word_timestamps=True,
            vad_filter=True,
        )
        segments: list[TranscriptSegment] = []
        vad: list[tuple[int, int]] = []
        for segment in segments_iter:
            words = [
                TranscriptWord(
                    startMs=round(word.start * 1_000),
                    endMs=max(round(word.end * 1_000), round(word.start * 1_000) + 1),
                    text=word.word,
                    probability=word.probability,
                )
                for word in (segment.words or [])
            ]
            start_ms = round(segment.start * 1_000)
            end_ms = max(round(segment.end * 1_000), start_ms + 1)
            segments.append(
                TranscriptSegment(
                    startMs=start_ms,
                    endMs=end_ms,
                    text=segment.text.strip(),
                    words=words,
                )
            )
            vad.append((start_ms, end_ms))
        return TranscriptResult(
            text=" ".join(segment.text for segment in segments).strip(),
            language=info.language,
            segments=segments,
            vad=vad,
        )


def create_transcriber(settings: Settings) -> Transcriber:
    """Select the configured provider without leaking it into the pipeline."""

    if settings.ANALYSIS_TRANSCRIPTION_PROVIDER == "faster-whisper":
        return FasterWhisperTranscriber(settings)
    if settings.ANALYSIS_TRANSCRIPTION_PROVIDER == "disabled":
        return DisabledTranscriber()
    return MockTranscriber()
