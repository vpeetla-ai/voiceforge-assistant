from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class DegradationReason(str, Enum):
    NONE = "none"
    ASR_TIMEOUT = "asr_timeout"
    ASR_FAILED = "asr_failed"
    LLM_TIMEOUT = "llm_timeout"
    LLM_UNAVAILABLE = "llm_unavailable"
    TTS_TIMEOUT = "tts_timeout"
    TTS_FAILED = "tts_failed"
    TOTAL_TIMEOUT = "total_timeout"


@dataclass
class DegradationPlan:
    reason: DegradationReason
    fallback: str  # text_input | browser_tts | cached_reply | abort
    message: str


def plan_for(reason: DegradationReason) -> DegradationPlan:
    mapping = {
        DegradationReason.NONE: DegradationPlan(
            reason, "none", "Pipeline completed normally."
        ),
        DegradationReason.ASR_TIMEOUT: DegradationPlan(
            reason,
            "text_input",
            "Speech recognition timed out — type your message instead.",
        ),
        DegradationReason.ASR_FAILED: DegradationPlan(
            reason,
            "text_input",
            "Could not transcribe audio — use text input.",
        ),
        DegradationReason.LLM_TIMEOUT: DegradationPlan(
            reason,
            "cached_reply",
            "LLM timed out — returning safe template response.",
        ),
        DegradationReason.LLM_UNAVAILABLE: DegradationPlan(
            reason,
            "cached_reply",
            "LLM unavailable — using offline template.",
        ),
        DegradationReason.TTS_TIMEOUT: DegradationPlan(
            reason,
            "browser_tts",
            "TTS timed out — browser will speak the reply.",
        ),
        DegradationReason.TTS_FAILED: DegradationPlan(
            reason,
            "browser_tts",
            "Server TTS failed — using browser speech synthesis.",
        ),
        DegradationReason.TOTAL_TIMEOUT: DegradationPlan(
            reason,
            "text_input",
            "Total pipeline budget exceeded — retry with text.",
        ),
    }
    return mapping.get(
        reason,
        DegradationPlan(reason, "text_input", "Degraded to text mode."),
    )
