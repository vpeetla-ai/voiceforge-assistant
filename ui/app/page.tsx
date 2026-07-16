'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GlassboxWorkbench } from '../components/GlassboxWorkbench';
import type { Latency, PipelineInput } from '../components/VoicePipelineGlassbox';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/voice';

const WAKE_HINT =
  'The demo API is on Render free tier and may be waking up (~30s after idle). Wait a moment and try again.';

// A failed fetch to a sleeping Render service surfaces as a TypeError ("Failed to
// fetch") rather than an HTTP error. Translate that into a friendly cold-start hint.
async function fetchJson(input: string, init?: RequestInit) {
  let resp: Response;
  try {
    resp = await fetch(input, init);
  } catch {
    throw new Error(WAKE_HINT);
  }
  if (!resp.ok) throw new Error((await resp.text()) || WAKE_HINT);
  return resp.json();
}

type VoiceResult = {
  transcript: string;
  reply: string;
  triage: Record<string, unknown>;
  audio_b64?: string | null;
  use_browser_tts: boolean;
  latency: Latency;
  degradation: string;
  degradation_message: string;
  sources: Record<string, string>;
};

type Config = {
  asr_mode: string;
  llm_mode: string;
  tts_mode: string;
  budgets_ms: Record<string, number>;
};

function speakBrowser(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

function playAudioB64(b64: string) {
  const audio = new Audio(`data:audio/mpeg;base64,${b64}`);
  void audio.play();
}

export default function HomePage() {
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useWs, setUseWs] = useState(false);
  const [traceSource, setTraceSource] = useState<'idle' | 'live' | 'replay'>('idle');
  const [metricsToken, setMetricsToken] = useState(0);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const asrStartRef = useRef<number>(0);

  useEffect(() => {
    fetch(`${API_URL}/v1/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => null);
  }, []);

  const triagePretty = useMemo(() => {
    if (!result?.triage) return null;
    return JSON.stringify(result.triage, null, 2);
  }, [result]);

  const budgets = config?.budgets_ms ?? { asr: 8000, llm: 15000, tts: 10000, total: 30000 };

  const pipeline: PipelineInput | null = useMemo(() => {
    if (!result) return null;
    return {
      latency: result.latency,
      budgets,
      sources: result.sources,
      degradation: result.degradation,
      degradationMessage: result.degradation_message,
      config: config
        ? { asr_mode: config.asr_mode, llm_mode: config.llm_mode, tts_mode: config.tts_mode }
        : null,
    };
  }, [result, budgets, config]);

  const handleResult = useCallback((data: VoiceResult, source: 'live' | 'replay') => {
    setResult(data);
    setTraceSource(source);
    if (data.audio_b64) {
      playAudioB64(data.audio_b64);
    } else if (data.use_browser_tts && data.reply) {
      speakBrowser(data.reply);
    }
  }, []);

  async function sendTurn(transcript: string, asrMs?: number) {
    setLoading(true);
    setError(null);
    try {
      if (useWs) {
        await sendViaWebSocket(transcript, asrMs);
      } else {
        const data = await fetchJson(`${API_URL}/v1/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, asr_ms: asrMs }),
        });
        handleResult(data, 'live');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Voice turn failed');
    } finally {
      setLoading(false);
    }
  }

  function sendViaWebSocket(transcript: string, asrMs?: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        ws.send(JSON.stringify({ event: 'turn', transcript, asr_ms: asrMs }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'result') {
          handleResult(msg, 'live');
          ws.close();
          resolve();
        }
      };
      ws.onerror = () => reject(new Error(`WebSocket error — ${WAKE_HINT}`));
    });
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Browser speech recognition not supported — use text input.');
      return;
    }
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = 'en-US';
    asrStartRef.current = performance.now();
    rec.onresult = (ev: SpeechRecognitionEvent) => {
      const transcript = ev.results[0][0].transcript;
      const asrMs = performance.now() - asrStartRef.current;
      setTextInput(transcript);
      void sendTurn(transcript, asrMs);
    };
    rec.onerror = () => setError('Microphone / ASR error — try text input.');
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function loadReplay() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchJson(`${API_URL}/v1/replay`);
      if (data.replay) {
        handleResult(data.replay as VoiceResult, 'replay');
      } else {
        setError('No replay saved yet.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <GlassboxWorkbench
      eyebrow="Voice interface layer"
      title="VoiceForge — glass-box voice triage"
      subtitle="Speak or type an IT issue and watch ASR → governed LLM → TTS replay under hard latency budgets. Architecture and live SLOs on the left, the product on the right."
      metricsRefreshToken={metricsToken}
      onReplayDone={() => setMetricsToken((t) => t + 1)}
      pipeline={pipeline}
      traceSource={traceSource}
      architect={{
        metricsUrl: `${API_URL}/v1/ops/metrics`,
        metricLabels: { runs: 'Voice turns', entities: 'Sessions', latency: 'P95 total' },
        layers: [
          { tier: 'L1', name: 'Voice UX', role: 'Browser + WebSocket', components: ['Web Speech ASR', 'Replay'] },
          { tier: 'L2', name: 'Pipeline', role: 'Phase budgets', components: ['ASR', 'LLM triage', 'Edge TTS'] },
          { tier: 'L3', name: 'Degradation', role: 'Budget enforcement', components: ['Text fallback', 'Timeouts'] },
          { tier: 'L4', name: 'Ops', role: 'Latency proof', components: ['/v1/ops/metrics', 'SLO'] },
        ],
        tradeoffs: [
          { decision: 'Browser ASR default', gain: 'Zero GPU on Render free tier', trade: 'Quality varies by browser' },
          { decision: 'Per-phase latency budgets', gain: 'Predictable UX under load', trade: 'May truncate slow LLM/TTS' },
          { decision: 'Pairs with DomainForge', gain: 'Same triage JSON contract', trade: 'Two services for full stack' },
        ],
        adrLinks: [
          {
            title: 'Case study — VoiceForge',
            href: 'https://github.com/vpeetla-ai/ai-architecture-portfolio/blob/main/case-studies/voiceforge-assistant.md',
          },
        ],
        docsLinks: [
          { title: 'Architecture', href: 'https://github.com/vpeetla-ai/voiceforge-assistant/blob/main/docs/ARCHITECTURE.md' },
          { title: 'SLO targets', href: 'https://github.com/vpeetla-ai/voiceforge-assistant/blob/main/docs/SLO.md' },
        ],
      }}
      productPanel={
        <>
          {config && (
            <div className="gb-modes">
              <span className="badge">ASR: {config.asr_mode}</span>
              <span className="badge">LLM: {config.llm_mode}</span>
              <span className="badge">TTS: {config.tts_mode}</span>
            </div>
          )}

          <p className="gb-guided">
            <strong>1.</strong> Speak or type an IT issue → <strong>2.</strong> watch the ASR → LLM → TTS
            budgets replay in the center → <strong>3.</strong> inspect the triage JSON below.
          </p>

          <div className="row">
            <button
              type="button"
              className={`mic ${listening ? 'listening' : ''}`}
              onClick={listening ? stopListening : startListening}
              disabled={loading}
            >
              {listening ? '⏹ Stop' : '🎤 Speak'}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => void sendTurn(textInput)}
              disabled={loading || !textInput.trim()}
            >
              Send text
            </button>
          </div>

          <label htmlFor="text" style={{ marginTop: '1rem' }}>
            Text fallback (graceful degradation)
          </label>
          <textarea
            id="text"
            rows={3}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Type or speak your IT issue…"
          />

          <div className="gb-run-row">
            <button type="button" className="secondary" onClick={() => void loadReplay()} disabled={loading}>
              Replay last turn
            </button>
          </div>

          <label className="gb-ws-toggle">
            <input type="checkbox" checked={useWs} onChange={(e) => setUseWs(e.target.checked)} />
            Use WebSocket transport
          </label>

          {error && <p className="error">{error}</p>}

          {result ? (
            <div className="gb-result">
              <h3>Transcript</h3>
              <p>{result.transcript || '—'}</p>
              <h3>Reply</h3>
              <p>{result.reply}</p>
              {triagePretty && (
                <>
                  <h3>Triage JSON</h3>
                  <pre className="triage">{triagePretty}</pre>
                </>
              )}
            </div>
          ) : (
            <p className="muted gb-empty-hint">No turn yet — run one to hear the reply and see triage output.</p>
          )}
        </>
      }
      secondaryPanel={
        <details className="gb-details">
          <summary>Stack status (details)</summary>
          <table className="status-table" style={{ marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th>Component</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Browser ASR</td>
                <td>✅ Live</td>
                <td>Web Speech API — default on Render free tier</td>
              </tr>
              <tr>
                <td>Server Whisper</td>
                <td>🔧 Optional</td>
                <td>pip install -e &quot;.[asr]&quot; on GPU host</td>
              </tr>
              <tr>
                <td>LLM triage</td>
                <td>✅ Mock / Ollama / DomainForge</td>
                <td>Pairs with DomainForge S0→S4 ladder</td>
              </tr>
              <tr>
                <td>Edge TTS</td>
                <td>✅ Server</td>
                <td>Browser speechSynthesis fallback</td>
              </tr>
              <tr>
                <td>WebSocket</td>
                <td>✅ /ws/voice</td>
                <td>Phase events + result payload</td>
              </tr>
            </tbody>
          </table>
        </details>
      }
    />
  );
}

// Web Speech API types (not in all TS libs)
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}
