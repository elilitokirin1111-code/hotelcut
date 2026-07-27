"""Analysis worker health tests."""

import httpx
import pytest

from hotelcut_analysis_worker.app import create_app


@pytest.mark.asyncio
async def test_health_reports_service_identity() -> None:
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "service": "hotelcut-analysis-worker",
        "status": "ok",
        "version": "0.0.0",
    }
