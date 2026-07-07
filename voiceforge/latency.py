from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LatencyBudget:
    """Per-phase latency tracking for portfolio waterfall visualization."""

    asr_ms: float = 0.0
    llm_ttft_ms: float = 0.0
    llm_total_ms: float = 0.0
    tts_ms: float = 0.0
    total_ms: float = 0.0
    phases: list[dict[str, Any]] = field(default_factory=list)

    def record(self, phase: str, ms: float, **meta: Any) -> None:
        entry = {"phase": phase, "ms": round(ms, 2), **meta}
        self.phases.append(entry)
        if phase == "asr":
            self.asr_ms = ms
        elif phase == "llm_ttft":
            self.llm_ttft_ms = ms
        elif phase == "llm_total":
            self.llm_total_ms = ms
        elif phase == "tts":
            self.tts_ms = ms
        elif phase == "total":
            self.total_ms = ms

    def to_dict(self) -> dict[str, Any]:
        return {
            "asr_ms": round(self.asr_ms, 2),
            "llm_ttft_ms": round(self.llm_ttft_ms, 2),
            "llm_total_ms": round(self.llm_total_ms, 2),
            "tts_ms": round(self.tts_ms, 2),
            "total_ms": round(self.total_ms, 2),
            "phases": self.phases,
            "p50_hint_ms": round(self.total_ms, 2),
        }


class PhaseTimer:
    def __init__(self, budget: LatencyBudget, phase: str) -> None:
        self.budget = budget
        self.phase = phase
        self._start = 0.0

    def __enter__(self) -> PhaseTimer:
        self._start = time.perf_counter()
        return self

    def __exit__(self, *args: object) -> None:
        elapsed_ms = (time.perf_counter() - self._start) * 1000
        self.budget.record(self.phase, elapsed_ms)
