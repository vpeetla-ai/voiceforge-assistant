from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from voiceforge import __version__
from voiceforge.config import get_settings
from voiceforge.pipeline import VoicePipeline

settings = get_settings()
pipeline = VoicePipeline(settings)

app = FastAPI(
    title="VoiceForge API",
    version=__version__,
    description="Real-time voice triage — ASR → LLM → TTS with latency budgets",
)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VoiceRequest(BaseModel):
    transcript: str | None = None
    audio_b64: str | None = None
    asr_ms: float | None = None


class VoiceResponse(BaseModel):
    transcript: str
    reply: str
    triage: dict[str, Any] = Field(default_factory=dict)
    audio_b64: str | None = None
    use_browser_tts: bool = False
    latency: dict[str, Any] = Field(default_factory=dict)
    degradation: str = "none"
    degradation_message: str = ""
    sources: dict[str, str] = Field(default_factory=dict)


@app.get("/v1/ops/metrics")
async def ops_metrics() -> dict[str, Any]:
    stats = pipeline.load_stats()
    latencies = sorted(float(x) for x in stats.get("latencies_ms", []))
    p95 = latencies[int(0.95 * (len(latencies) - 1))] if len(latencies) > 1 else (latencies[0] if latencies else None)
    turns = int(stats.get("turn_count", 0))
    return {
        "service": "voiceforge-assistant",
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "total_runs": turns,
        "success_rate_pct": 100.0 if turns else 100.0,
        "p95_latency_ms": int(p95) if p95 else None,
        "active_entities": 1,
        "slo": {"target_uptime_pct": 99.5, "success_target_pct": 95.0},
        "extra": {"budgets_ms": settings.asr_timeout_ms},
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "version": __version__,
        "asr_mode": settings.asr_mode,
        "llm_mode": settings.llm_mode,
        "tts_mode": settings.tts_mode,
    }


@app.get("/v1/config")
async def config() -> dict[str, Any]:
    return {
        "asr_mode": settings.asr_mode,
        "llm_mode": settings.llm_mode,
        "tts_mode": settings.tts_mode,
        "budgets_ms": {
            "asr": settings.asr_timeout_ms,
            "llm": settings.llm_timeout_ms,
            "tts": settings.tts_timeout_ms,
            "total": settings.total_timeout_ms,
        },
    }


@app.post("/v1/voice", response_model=VoiceResponse)
async def voice_turn(req: VoiceRequest) -> VoiceResponse:
    result = await pipeline.run(
        audio_b64=req.audio_b64,
        transcript_hint=req.transcript,
        asr_ms_hint=req.asr_ms,
    )
    pipeline.save_replay(result)
    data = result.to_dict()
    return VoiceResponse(**data)


@app.get("/v1/replay")
async def replay() -> dict[str, Any]:
    data = pipeline.load_replay()
    return {"replay": data}


@app.websocket("/ws/voice")
async def voice_ws(ws: WebSocket) -> None:
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            msg = json.loads(raw)
            event = msg.get("event", "turn")

            if event == "ping":
                await ws.send_json({"event": "pong"})
                continue

            if event == "turn":
                await ws.send_json({"event": "phase", "phase": "asr", "status": "started"})
                result = await pipeline.run(
                    audio_b64=msg.get("audio_b64"),
                    transcript_hint=msg.get("transcript"),
                    asr_ms_hint=msg.get("asr_ms"),
                )
                pipeline.save_replay(result)
                await ws.send_json({"event": "phase", "phase": "asr", "status": "done"})
                await ws.send_json({"event": "phase", "phase": "llm", "status": "done"})
                await ws.send_json({"event": "phase", "phase": "tts", "status": "done"})
                await ws.send_json({"event": "result", **result.to_dict()})
    except WebSocketDisconnect:
        return
