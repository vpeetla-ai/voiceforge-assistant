import pytest
from httpx import ASGITransport, AsyncClient

from api.main import app


@pytest.mark.asyncio
async def test_health():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.asyncio
async def test_voice_turn_mock():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/v1/voice",
            json={"transcript": "Email sync broken on mobile", "asr_ms": 450},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["transcript"] == "Email sync broken on mobile"
    assert data["reply"]
    assert data["latency"]["asr_ms"] == 450


@pytest.mark.asyncio
async def test_config_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/v1/config")
    assert resp.status_code == 200
    assert "budgets_ms" in resp.json()
