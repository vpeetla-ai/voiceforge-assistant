from __future__ import annotations

import json
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

import httpx

from voiceforge.config import Settings


@dataclass
class LLMResult:
    reply: str
    triage: dict[str, Any] = field(default_factory=dict)
    ttft_ms: float = 0.0
    total_ms: float = 0.0
    source: str = "mock"


class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, transcript: str) -> LLMResult:
        ...


class MockLLMProvider(LLMProvider):
    """Deterministic triage JSON for demos without GPU."""

    async def generate(self, transcript: str) -> LLMResult:
        start = time.perf_counter()
        triage = {
            "category": "network",
            "urgency": "medium",
            "summary": transcript[:120],
            "recommended_action": "Reset network adapter and verify VPN settings.",
            "solution_id": "S2_SFT_PEFT",
        }
        reply = (
            f"I classified this as a {triage['category']} issue with {triage['urgency']} urgency. "
            f"{triage['recommended_action']}"
        )
        total = (time.perf_counter() - start) * 1000
        return LLMResult(reply=reply, triage=triage, ttft_ms=total * 0.3, total_ms=total, source="mock")


class OllamaLLMProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate(self, transcript: str) -> LLMResult:
        prompt = (
            "You are an IT triage assistant. Respond with JSON: "
            '{"category","urgency","summary","recommended_action","solution_id"} '
            f"for: {transcript}"
        )
        start = time.perf_counter()
        ttft_ms = 0.0
        async with httpx.AsyncClient(timeout=self.settings.llm_timeout_ms / 1000) as client:
            payload = {
                "model": self.settings.ollama_model,
                "prompt": prompt,
                "stream": True,
            }
            chunks: list[str] = []
            first = True
            async with client.stream(
                "POST",
                f"{self.settings.ollama_base_url}/api/generate",
                json=payload,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    if first and data.get("response"):
                        ttft_ms = (time.perf_counter() - start) * 1000
                        first = False
                    if data.get("response"):
                        chunks.append(data["response"])
        raw = "".join(chunks)
        total = (time.perf_counter() - start) * 1000
        triage = _parse_triage(raw, transcript)
        reply = triage.get("recommended_action") or raw[:500]
        return LLMResult(reply=str(reply), triage=triage, ttft_ms=ttft_ms, total_ms=total, source="ollama")


class DomainForgeLLMProvider(LLMProvider):
    """Route voice transcript to DomainForge /v1/query for governed triage."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate(self, transcript: str) -> LLMResult:
        start = time.perf_counter()
        async with httpx.AsyncClient(timeout=self.settings.llm_timeout_ms / 1000) as client:
            resp = await client.post(
                f"{self.settings.domainforge_api_url}/v1/query",
                json={"query": transcript, "top_k": 3},
            )
            resp.raise_for_status()
            data = resp.json()
        total = (time.perf_counter() - start) * 1000
        answer = data.get("answer") or data.get("response") or ""
        triage = {
            "category": data.get("category", "general"),
            "urgency": data.get("urgency", "medium"),
            "summary": transcript[:120],
            "recommended_action": answer,
            "solution_id": data.get("solution_id", "S0_BASELINE"),
            "citations": data.get("citations", []),
        }
        return LLMResult(reply=answer, triage=triage, ttft_ms=total * 0.4, total_ms=total, source="domainforge")


def _parse_triage(raw: str, transcript: str) -> dict[str, Any]:
    try:
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(raw[start:end])
    except json.JSONDecodeError:
        pass
    return {
        "category": "general",
        "urgency": "medium",
        "summary": transcript[:120],
        "recommended_action": raw[:300],
        "solution_id": "S0_BASELINE",
    }


def get_llm_provider(settings: Settings) -> LLMProvider:
    mode = settings.llm_mode.lower()
    if mode == "ollama":
        return OllamaLLMProvider(settings)
    if mode == "domainforge":
        return DomainForgeLLMProvider(settings)
    return MockLLMProvider()
