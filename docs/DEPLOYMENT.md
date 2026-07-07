# VoiceForge Deployment

## Render (API)

1. Push repo to GitHub `vpeetla-ai/voiceforge-assistant`
2. New Web Service → connect repo → use `render.yaml`
3. Default env: `ASR_MODE=browser_asr`, `LLM_MODE=mock`, `TTS_MODE=edge`
4. Health check: `/health`

### Optional: DomainForge LLM

```
LLM_MODE=domainforge
DOMAINFORGE_API_URL=https://domainforge-api.onrender.com
```

### Optional: Ollama (GPU host)

Run Ollama on RunPod/local, point Render env:

```
LLM_MODE=ollama
OLLAMA_BASE_URL=https://your-ollama-host:11434
```

## Vercel (UI)

1. Import `ui/` directory or monorepo root with root `ui`
2. Set environment:
   - `NEXT_PUBLIC_API_URL=https://voiceforge-api.onrender.com`
   - `NEXT_PUBLIC_WS_URL=wss://voiceforge-api.onrender.com/ws/voice`
3. Build: `npm run build` (static export to `out/`)

## Local dev

```bash
pip install -e ".[dev,tts,api]"
uvicorn api.main:app --reload --port 8000

cd ui && NEXT_PUBLIC_API_URL=http://localhost:8000 npm run dev
```

## CORS

Update `CORS_ORIGINS` on Render when Vercel URL is known.
