from __future__ import annotations

import base64
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

from voiceforge.config import Settings


@dataclass
class TranscriptResult:
    text: str
    confidence: float = 1.0
    source: str = "browser"
    latency_ms: float = 0.0


class ASRProvider(ABC):
    @abstractmethod
    async def transcribe(self, audio_b64: str | None, text_hint: str | None = None) -> TranscriptResult:
        ...


class BrowserASRProvider(ASRProvider):
    """Client-side Web Speech API sends transcript; server validates only."""

    async def transcribe(self, audio_b64: str | None, text_hint: str | None = None) -> TranscriptResult:
        if not text_hint or not text_hint.strip():
            return TranscriptResult(text="", confidence=0.0, source="browser")
        return TranscriptResult(text=text_hint.strip(), confidence=0.95, source="browser")


class MockASRProvider(ASRProvider):
    async def transcribe(self, audio_b64: str | None, text_hint: str | None = None) -> TranscriptResult:
        return TranscriptResult(
            text=text_hint or "My laptop won't connect to Wi-Fi after the update.",
            confidence=1.0,
            source="mock",
        )


class WhisperASRProvider(ASRProvider):
    """Server-side faster-whisper — optional extra dep for GPU/CPU hosts."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._model = None

    def _load_model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(self.settings.whisper_model, device="cpu", compute_type="int8")
        return self._model

    async def transcribe(self, audio_b64: str | None, text_hint: str | None = None) -> TranscriptResult:
        if text_hint:
            return TranscriptResult(text=text_hint.strip(), confidence=0.9, source="whisper_hint")
        if not audio_b64:
            return TranscriptResult(text="", confidence=0.0, source="whisper")
        start = time.perf_counter()
        import tempfile
        from pathlib import Path

        raw = base64.b64decode(audio_b64)
        with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
            f.write(raw)
            path = Path(f.name)
        try:
            model = self._load_model()
            segments, _ = model.transcribe(str(path))
            text = " ".join(s.text.strip() for s in segments)
            ms = (time.perf_counter() - start) * 1000
            return TranscriptResult(text=text, confidence=0.85, source="whisper", latency_ms=ms)
        finally:
            path.unlink(missing_ok=True)


def get_asr_provider(settings: Settings) -> ASRProvider:
    mode = settings.asr_mode.lower()
    if mode == "server_whisper":
        return WhisperASRProvider(settings)
    if mode == "mock":
        return MockASRProvider()
    return BrowserASRProvider()
