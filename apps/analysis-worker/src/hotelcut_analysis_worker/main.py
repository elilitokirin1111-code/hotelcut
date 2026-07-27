"""Analysis worker process entry point."""

import uvicorn

from hotelcut_analysis_worker.app import create_app
from hotelcut_analysis_worker.config import Settings


def run() -> None:
    """Start the worker health process."""

    settings = Settings()
    uvicorn.run(
        create_app(settings),
        host=settings.ANALYSIS_WORKER_HOST,
        port=settings.ANALYSIS_WORKER_PORT,
    )


if __name__ == "__main__":
    run()
