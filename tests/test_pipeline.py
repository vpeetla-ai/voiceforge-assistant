import pytest

from voiceforge.asr import BrowserASRProvider, MockASRProvider
from voiceforge.config import Settings
from voiceforge.degradation import DegradationReason, plan_for
from voiceforge.latency import LatencyBudget
from voiceforge.llm import MockLLMProvider
from voiceforge.pipeline import VoicePipeline
from voiceforge.tts import MockTTSProvider


@pytest.mark.asyncio
async def test_mock_pipeline_end_to_end():
    settings = Settings(asr_mode="mock", llm_mode="mock", tts_mode="mock")
    pipe = VoicePipeline(
        settings=settings,
        asr=MockASRProvider(),
        llm=MockLLMProvider(),
        tts=MockTTSProvider(),
    )
    result = await pipe.run()
    assert result.transcript
    assert result.reply
    assert result.triage.get("category") == "network"
    assert result.latency.total_ms >= 0
    assert result.sources["llm"] == "mock"


@pytest.mark.asyncio
async def test_browser_asr_with_hint():
    asr = BrowserASRProvider()
    out = await asr.transcribe(None, "VPN drops every hour")
    assert out.text == "VPN drops every hour"
    assert out.source == "browser"


@pytest.mark.asyncio
async def test_empty_transcript_degrades():
    settings = Settings()
    pipe = VoicePipeline(
        settings=settings,
        asr=BrowserASRProvider(),
        llm=MockLLMProvider(),
        tts=MockTTSProvider(),
    )
    result = await pipe.run(transcript_hint="")
    assert result.degradation == DegradationReason.ASR_FAILED.value
    assert "text" in result.degradation_message.lower()


def test_latency_budget_records_phases():
    budget = LatencyBudget()
    budget.record("asr", 120.5)
    budget.record("llm_ttft", 340.0)
    budget.record("total", 2100.0)
    d = budget.to_dict()
    assert d["asr_ms"] == 120.5
    assert len(d["phases"]) == 3


def test_degradation_plan_messages():
    plan = plan_for(DegradationReason.TTS_TIMEOUT)
    assert plan.fallback == "browser_tts"
    assert "browser" in plan.message.lower()


@pytest.mark.asyncio
async def test_replay_roundtrip(tmp_path):
    settings = Settings(replay_store_path=tmp_path / "replay.json")
    pipe = VoicePipeline(
        settings=settings,
        asr=MockASRProvider(),
        llm=MockLLMProvider(),
        tts=MockTTSProvider(),
    )
    result = await pipe.run()
    pipe.save_replay(result)
    loaded = pipe.load_replay()
    assert loaded is not None
    assert loaded["transcript"] == result.transcript
