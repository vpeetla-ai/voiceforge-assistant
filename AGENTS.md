# Agent Instructions — VoiceForge

Read [CONTEXT.md](https://github.com/vpeetla-ai/ai-content-factory/blob/main/CONTEXT.md) for org vocabulary.

## Stack layer

**Voice / Multimodal** — ASR → LLM → TTS with latency budgets. Pairs with DomainForge for governed triage.

## Conventions

- Python 3.11+, FastAPI, Pydantic v2
- `pip install -e ".[dev,tts,api]"` + `pytest -q` before claiming done
- Default modes: `browser_asr`, `mock` LLM, `edge` TTS (Render-friendly)
- Side effects (TTS publish) → future AegisAI gate

## When stuck

1. Check `docs/adr/ADR-001-voice-pipeline.md`
2. Compare with DomainForge deploy patterns (`render.yaml`, static Next.js UI)
