"""FastAPI health boundary for the analysis worker."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from redis.asyncio import Redis

from hotelcut_analysis_worker import __version__
from hotelcut_analysis_worker.config import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    """Create the worker health application without starting queue consumption."""

    resolved_settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.redis = Redis.from_url(str(resolved_settings.REDIS_URL))
        try:
            yield
        finally:
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
        except Exception as error:
            raise HTTPException(status_code=503, detail="redis_unavailable") from error

        if not redis_ready:
            raise HTTPException(status_code=503, detail="redis_unavailable")

        return {
            "checks": {"redis": "ok"},
            "service": "hotelcut-analysis-worker",
            "status": "ready",
        }

    return app
