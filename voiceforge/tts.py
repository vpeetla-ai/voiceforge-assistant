from __future__ import annotations

import base64
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass

from voiceforge.config import Settings


@dataclass
class TTSResult:
    audio_b64: str | None
    mime_type: str = "audio/mpeg"
    source: str = "edge"
    latency_ms: float = 0.0
    use_browser: bool = False


class TTSProvider(ABC):
    @abstractmethod
    async def synthesize(self, text: str) -> TTSResult:
        ...


class MockTTSProvider(TTSProvider):
    async def synthesize(self, text: str) -> TTSResult:
        return TTSResult(audio_b64=None, source="mock", use_browser=True)


class BrowserTTSProvider(TTSProvider):
    async def synthesize(self, text: str) -> TTSResult:
        return TTSResult(audio_b64=None, source="browser", use_browser=True)


class EdgeTTSProvider(TTSProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def synthesize(self, text: str) -> TTSResult:
        start = time.perf_counter()
        try:
            import edge_tts
            import tempfile
            from pathlib import Path

            communicate = edge_tts.Communicate(text, self.settings.edge_tts_voice)
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                path = Path(f.name)
            await communicate.save(str(path))
            audio_b64 = base64.b64encode(path.read_bytes()).decode("ascii")
            path.unlink(missing_ok=True)
            ms = (time.perf_counter() - start) * 1000
            return TTSResult(audio_b64=audio_b64, source="edge", latency_ms=ms)
        except Exception:
            return TTSResult(audio_b64=None, source="edge_fallback", use_browser=True)


def get_tts_provider(settings: Settings) -> TTSProvider:
    mode = settings.tts_mode.lower()
    if mode == "browser":
        return BrowserTTSProvider()
    if mode == "mock":
        return MockTTSProvider()
    return EdgeTTSProvider(settings)
