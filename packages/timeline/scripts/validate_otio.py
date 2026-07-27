from pathlib import Path
import sys

import opentimelineio as otio


fixture_path = Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures/basic-timeline.otio")
timeline = otio.adapters.read_from_file(str(fixture_path))

print(
    f"OpenTimelineIO {otio.__version__}: "
    f"{len(timeline.tracks)} tracks, duration {timeline.duration()}"
)
