from pathlib import Path

from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.providers import (
    DisabledTranscriber,
    MockTranscriber,
    create_transcriber,
)


def test_mock_transcriber_returns_word_timestamps_and_vad() -> None:
    transcript = MockTranscriber().transcribe(Path("audio.wav"), 1_600)

    assert transcript.text == "HotelCut 测试素材"
    assert transcript.language == "zh"
    assert transcript.vad == [(0, 1_600)]
    assert [word.text for word in transcript.segments[0].words] == ["HotelCut", "测试素材"]
    assert transcript.segments[0].words[-1].endMs == 1_600


def test_disabled_provider_is_explicitly_selectable() -> None:
    settings = Settings(ANALYSIS_TRANSCRIPTION_PROVIDER="disabled")

    transcriber = create_transcriber(settings)

    assert isinstance(transcriber, DisabledTranscriber)
    assert transcriber.transcribe(Path("audio.wav"), 1_000).segments == []
