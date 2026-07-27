"""BullMQ integration kept outside media-domain modules."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Protocol, cast

from hotelcut_analysis_worker.models import AnalysisJobData
from hotelcut_analysis_worker.processor import AnalysisProcessor


class WorkerHandle(Protocol):
    async def close(self) -> None:
        """Stop consuming jobs and release Redis connections."""


def create_queue_worker(
    queue_name: str,
    redis_url: str,
    processor: AnalysisProcessor,
) -> WorkerHandle:
    """Create the experimental official Python BullMQ worker."""

    from bullmq import Worker

    async def process(job: object, job_token: str) -> dict[str, str]:
        del job_token
        raw_data = getattr(job, "data", None)
        data = AnalysisJobData.model_validate(raw_data)
        return await asyncio.to_thread(processor.process, data)

    callback = cast(Callable[[object, str], Awaitable[dict[str, str]]], process)
    return cast(
        WorkerHandle,
        Worker(queue_name, callback, {"connection": redis_url}),
    )
