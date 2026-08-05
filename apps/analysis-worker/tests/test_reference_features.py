from hotelcut_analysis_worker.models import SceneRange, TranscriptResult
from hotelcut_analysis_worker.processor import _reference_features


def test_reference_features_exposes_reusable_editing_signals() -> None:
    result = _reference_features(
        {"durationMs": 10_000},
        TranscriptResult(
            text="欢迎入住",
            language="zh",
            segments=[],
            vad=[(500, 2_500), (4_000, 5_000)],
        ),
        [
            SceneRange(startMs=0, endMs=2_000),
            SceneRange(startMs=2_000, endMs=5_000),
            SceneRange(startMs=5_000, endMs=10_000),
        ],
    )

    assert result == {
        "sceneCount": 3,
        "averageShotDurationMs": 3333,
        "openingCutCount": 2,
        "paceCurve": [
            {"startMs": 0, "endMs": 2_000, "durationMs": 2_000},
            {"startMs": 2_000, "endMs": 5_000, "durationMs": 3_000},
            {"startMs": 5_000, "endMs": 10_000, "durationMs": 5_000},
        ],
        "speechCoverageBasisPoints": 3_000,
        "vad": [{"startMs": 500, "endMs": 2_500}, {"startMs": 4_000, "endMs": 5_000}],
    }
