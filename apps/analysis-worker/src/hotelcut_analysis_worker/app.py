"""FastAPI health boundary for the analysis worker."""

import asyncio
import shutil
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from redis.asyncio import Redis

from hotelcut_analysis_worker import __version__
from hotelcut_analysis_worker.config import Settings
from hotelcut_analysis_worker.processor import AnalysisProcessor
from hotelcut_analysis_worker.queue_worker import create_queue_worker


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the worker API and queue-consumer lifecycle."""

    resolved_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.redis = Redis.from_url(str(resolved_settings.REDIS_URL))
        app.state.analysis_worker = None
        if resolved_settings.ANALYSIS_QUEUE_ENABLED:
            processor = AnalysisProcessor(resolved_settings)
            app.state.analysis_worker = create_queue_worker(
                resolved_settings.ANALYSIS_QUEUE_NAME,
                str(resolved_settings.REDIS_URL),
                processor,
            )
        try:
            yield
        finally:
            if app.state.analysis_worker is not None:
                await app.state.analysis_worker.close()
            await app.state.redis.aclose()

    app = FastAPI(
        title="HotelCut Analysis Worker",
        version=__version__,
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {
            "service": "hotelcut-analysis-worker",
            "status": "ok",
            "version": __version__,
        }

    @app.get("/ready")
    async def ready() -> dict[str, object]:
        try:
            redis_ready = bool(await app.state.redis.ping())
            binaries_ready = await asyncio.to_thread(
                lambda: all(
                    shutil.which(binary)
                    for binary in (
                        resolved_settings.FFMPEG_PATH,
                        resolved_settings.FFPROBE_PATH,
                    )
                )
            )
        except Exception as error:
            raise HTTPException(status_code=503, detail="redis_unavailable") from error

        if not redis_ready or not binaries_ready:
            raise HTTPException(status_code=503, detail="analysis_dependencies_unavailable")

        return {
            "checks": {"ffmpeg": "ok", "ffprobe": "ok", "redis": "ok"},
            "service": "hotelcut-analysis-worker",
            "status": "ready",
        }

    return app
