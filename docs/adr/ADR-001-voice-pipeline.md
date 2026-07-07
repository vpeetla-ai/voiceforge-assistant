# ADR-001: Voice Pipeline Architecture

**Status:** Accepted  
**Date:** 2026-07-06  
**Context:** Portfolio Pillar 5 — Real-Time Multimodal / Voice

## Decision

Build VoiceForge as a **modular ASR → LLM → TTS pipeline** with:

1. **Browser-first ASR** on Render free tier (Web Speech API sends transcript + client `asr_ms`)
2. **Pluggable LLM** — mock (demo), Ollama (local GPU), DomainForge API (governed triage)
3. **Server TTS** via `edge-tts` with browser `speechSynthesis` fallback
4. **Latency budget tracking** per phase for portfolio waterfall visualization
5. **Graceful degradation** — explicit `DegradationReason` enum and user-facing fallback messages
6. **Dual transport** — REST for simplicity, WebSocket for phase events

## Rationale

| Constraint | Choice |
|------------|--------|
| Render free tier has no GPU | Default ASR in browser, not server Whisper |
| Portfolio needs honest demos | Mock LLM works without secrets; real paths are env-switched |
| Pairs with DomainForge | `LLM_MODE=domainforge` routes to existing `/v1/query` |
| Sub-30s SLA | `total_timeout_ms` budget with per-phase timers |

## Consequences

- **Positive:** Pillar 5 closed with deployable demo + tests + ADR
- **Positive:** Same FastAPI + static Next.js pattern as DomainForge
- **Negative:** Browser ASR quality varies by Chrome/Safari; server Whisper is opt-in
- **Future:** AegisAI HITL before TTS publish; streaming LLM tokens over WebSocket

## Alternatives considered

1. **Full server Whisper on Render** — rejected (CPU/memory limits on free tier)
2. **Single WebSocket-only API** — rejected; REST kept for curl/tests
3. **Embedded LLM in browser** — rejected; triage belongs on governed backend
