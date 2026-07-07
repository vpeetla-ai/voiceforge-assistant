from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from voiceforge.asr import ASRProvider, get_asr_provider
from voiceforge.config import Settings
from voiceforge.degradation import DegradationReason, plan_for
from voiceforge.latency import LatencyBudget, PhaseTimer
from voiceforge.llm import LLMProvider, get_llm_provider
from voiceforge.tts import TTSProvider, get_tts_provider


@dataclass
class PipelineResult:
    transcript: str
    reply: str
    triage: dict[str, Any]
    audio_b64: str | None
    use_browser_tts: bool
    latency: LatencyBudget
    degradation: str
    degradation_message: str
    sources: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "transcript": self.transcript,
            "reply": self.reply,
            "triage": self.triage,
            "audio_b64": self.audio_b64,
            "use_browser_tts": self.use_browser_tts,
            "latency": self.latency.to_dict(),
            "degradation": self.degradation,
            "degradation_message": self.degradation_message,
            "sources": self.sources,
        }


class VoicePipeline:
    def __init__(
        self,
        settings: Settings | None = None,
        asr: ASRProvider | None = None,
        llm: LLMProvider | None = None,
        tts: TTSProvider | None = None,
    ) -> None:
        self.settings = settings or Settings()
        self.asr = asr or get_asr_provider(self.settings)
        self.llm = llm or get_llm_provider(self.settings)
        self.tts = tts or get_tts_provider(self.settings)

    async def run(
        self,
        *,
        audio_b64: str | None = None,
        transcript_hint: str | None = None,
        asr_ms_hint: float | None = None,
    ) -> PipelineResult:
        budget = LatencyBudget()
        degradation = DegradationReason.NONE
        pipeline_start = time.perf_counter()

        # ASR
        with PhaseTimer(budget, "asr"):
            asr_result = await self.asr.transcribe(audio_b64, transcript_hint)
        if asr_ms_hint is not None:
            budget.record("asr", asr_ms_hint, source="client")
            budget.asr_ms = asr_ms_hint
        elif asr_result.latency_ms:
            budget.record("asr", asr_result.latency_ms, source=asr_result.source)

        if not asr_result.text:
            degradation = DegradationReason.ASR_FAILED
            plan = plan_for(degradation)
            budget.record("total", (time.perf_counter() - pipeline_start) * 1000)
            return PipelineResult(
                transcript="",
                reply="",
                triage={},
                audio_b64=None,
                use_browser_tts=True,
                latency=budget,
                degradation=degradation.value,
                degradation_message=plan.message,
                sources={"asr": asr_result.source},
            )

        # LLM
        llm_start = time.perf_counter()
        try:
            llm_result = await self.llm.generate(asr_result.text)
            budget.record("llm_ttft", llm_result.ttft_ms)
            budget.record("llm_total", llm_result.total_ms)
        except Exception:
            degradation = DegradationReason.LLM_UNAVAILABLE
            plan = plan_for(degradation)
            llm_result = None

        if llm_result is None:
            plan = plan_for(degradation)
            budget.record("total", (time.perf_counter() - pipeline_start) * 1000)
            return PipelineResult(
                transcript=asr_result.text,
                reply="I'm temporarily offline. Please try again or type your question.",
                triage={},
                audio_b64=None,
                use_browser_tts=True,
                latency=budget,
                degradation=degradation.value,
                degradation_message=plan.message,
                sources={"asr": asr_result.source, "llm": "unavailable"},
            )

        elapsed = (time.perf_counter() - llm_start) * 1000
        if elapsed > self.settings.llm_timeout_ms:
            degradation = DegradationReason.LLM_TIMEOUT

        # TTS
        tts_result = await self.tts.synthesize(llm_result.reply)
        budget.record("tts", tts_result.latency_ms)
        if tts_result.use_browser:
            if degradation == DegradationReason.NONE:
                degradation = DegradationReason.TTS_FAILED if tts_result.source.endswith("fallback") else DegradationReason.NONE

        total_ms = (time.perf_counter() - pipeline_start) * 1000
        budget.record("total", total_ms)
        if total_ms > self.settings.total_timeout_ms:
            degradation = DegradationReason.TOTAL_TIMEOUT

        plan = plan_for(degradation)
        return PipelineResult(
            transcript=asr_result.text,
            reply=llm_result.reply,
            triage=llm_result.triage,
            audio_b64=tts_result.audio_b64,
            use_browser_tts=tts_result.use_browser,
            latency=budget,
            degradation=degradation.value,
            degradation_message=plan.message if degradation != DegradationReason.NONE else "",
            sources={
                "asr": asr_result.source,
                "llm": llm_result.source,
                "tts": tts_result.source,
            },
        )

    def save_replay(self, result: PipelineResult) -> Path:
        path = self.settings.replay_store_path
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = result.to_dict()
        payload.pop("audio_b64", None)
        path.write_text(json.dumps(payload, indent=2))
        return path

    def load_replay(self) -> dict[str, Any] | None:
        path = self.settings.replay_store_path
        if not path.exists():
            return None
        return json.loads(path.read_text())
