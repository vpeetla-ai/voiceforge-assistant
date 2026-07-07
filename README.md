# VoiceForge

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Real-time voice triage** — ASR → LLM → TTS with latency budgets, WebSocket streaming, and graceful degradation.

Closes **Portfolio Pillar 5** (Real-Time Multimodal / Voice) for the [vpeetla-ai](https://github.com/vpeetla-ai) org.

## Problem

Voice assistants need sub-30s end-to-end latency with visible phase breakdowns and fallbacks when ASR, LLM, or TTS fail. Most demos hide degradation paths.

## 60-second architecture

```
Mic (browser) ──► ASR ──► LLM triage ──► TTS ──► speaker
     │              │          │            │
     └─ Web Speech  └─ mock/   └─ DomainForge  └─ edge-tts
        API            Ollama      /v1/query       + browser fallback
```

| Layer | Default (Render free) | Upgrade path |
|-------|----------------------|--------------|
| ASR | Browser Web Speech API | `faster-whisper` server |
| LLM | Mock triage JSON | Ollama / DomainForge API |
| TTS | `edge-tts` | Browser `speechSynthesis` fallback |
| Transport | REST `/v1/voice` | WebSocket `/ws/voice` |

## Honest status

| Component | Status | Notes |
|-----------|--------|-------|
| Browser ASR + text fallback | ✅ Live | Client-side; `asr_ms` reported to server |
| Mock LLM triage | ✅ Live | Deterministic JSON for demos |
| DomainForge LLM route | ✅ Wired | Set `LLM_MODE=domainforge` |
| Ollama LLM | ✅ Wired | Set `LLM_MODE=ollama` + GPU host |
| Edge TTS | ✅ Live | `pip install -e ".[tts]"` |
| Server Whisper | 🔧 Optional | `pip install -e ".[asr]"` — not on Render free |
| Latency waterfall UI | ✅ Live | ASR / LLM / TTS / total bars |
| WebSocket phases | ✅ Live | `phase` events + `result` |
| Replay | ✅ Live | `/v1/replay` last turn |
| Graceful degradation | ✅ Live | text input, browser TTS, cached reply |

## Quick start

```bash
# API
cp .env.example .env
pip install -e ".[dev,tts,api]"
make serve          # http://localhost:8000

# UI
cd ui && npm install && npm run dev   # http://localhost:3000
```

```bash
# Run tests
pytest -q
```

### API examples

```bash
curl http://localhost:8000/health

curl -X POST http://localhost:8000/v1/voice \
  -H 'Content-Type: application/json' \
  -d '{"transcript":"VPN keeps disconnecting","asr_ms":420}'
```

## Deploy

| Target | Config |
|--------|--------|
| API (Render) | [voiceforge-api-eysb.onrender.com](https://voiceforge-api-eysb.onrender.com/health) |
| UI (Vercel) | `ui/` static export, `NEXT_PUBLIC_API_URL` |

## Stack integration

- **DomainForge** — voice transcript → `/v1/query` governed triage (S0→S4)
- **AegisAI** — optional HITL gate before TTS side effects (future)
- **Portfolio Pillar 5** — multimodal voice pipeline with measurable latency

## Docs

- [ADR-001: Voice pipeline architecture](docs/adr/ADR-001-voice-pipeline.md)
- [Deployment guide](docs/DEPLOYMENT.md)

## License

MIT
