# Media analysis

Status: planned for M2.

## Pipeline

1. Complete an authenticated object-storage upload.
2. Verify checksum and media type.
3. Probe codec, duration, frame rate, resolution and orientation with ffprobe.
4. Create proxy media, thumbnails, audio and waveform data.
5. Detect scene boundaries.
6. Transcribe speech with time-aligned words.
7. Detect silence, black frames, short scenes and duplicate fingerprints.
8. Persist results and an explainable terminal status.

Provider boundaries must allow faster-whisper and PySceneDetect to be disabled or mocked.
Provider failure must leave media available for manual tagging and basic video creation.

Analysis workers use isolated temporary directories, sanitized process arguments and retry-safe
jobs. M0 exposes only the worker health boundary.
