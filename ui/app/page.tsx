'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws/voice';

type Latency = {
  asr_ms: number;
  llm_ttft_ms: number;
  llm_total_ms: number;
  tts_ms: number;
  total_ms: number;
};

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

function Waterfall({ latency, budgets }: { latency: Latency; budgets: Record<string, number> }) {
  const max = Math.max(latency.total_ms, budgets.total || 30000, 1);
  const bars = [
    { key: 'asr', ms: latency.asr_ms, budget: budgets.asr, cls: 'asr', label: 'ASR' },
    { key: 'llm', ms: latency.llm_total_ms, budget: budgets.llm, cls: 'llm', label: 'LLM' },
    { key: 'tts', ms: latency.tts_ms, budget: budgets.tts, cls: 'tts', label: 'TTS' },
  ];

  return (
    <div>
      <div className="waterfall">
        {bars.map((b) => (
          <div
            key={b.key}
            className={`bar ${b.cls}`}
            style={{ height: `${Math.max(8, (b.ms / max) * 100)}%`, flex: b.ms || 1 }}
            title={`${b.label}: ${b.ms.toFixed(0)}ms / budget ${b.budget}ms`}
          >
            {b.ms > 0 ? `${b.ms.toFixed(0)}ms` : '—'}
          </div>
        ))}
      </div>
      <div className="phase-labels">
        {bars.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
        Total: <strong style={{ color: 'var(--text)' }}>{latency.total_ms.toFixed(0)}ms</strong>
        {' · '}
        LLM TTFT: {latency.llm_ttft_ms.toFixed(0)}ms
      </p>
    </div>
  );
}

export default function HomePage() {
  const [textInput, setTextInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState<VoiceResult | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useWs, setUseWs] = useState(false);
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

  const handleResult = useCallback((data: VoiceResult) => {
    setResult(data);
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
        const resp = await fetch(`${API_URL}/v1/voice`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript, asr_ms: asrMs }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        handleResult(await resp.json());
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
          handleResult(msg);
          ws.close();
          resolve();
        }
      };
      ws.onerror = () => reject(new Error('WebSocket error'));
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
      const resp = await fetch(`${API_URL}/v1/replay`);
      const data = await resp.json();
      if (data.replay) {
        setResult(data.replay as VoiceResult);
      } else {
        setError('No replay saved yet.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Replay failed');
    } finally {
      setLoading(false);
    }
  }

  const budgets = config?.budgets_ms ?? { asr: 8000, llm: 15000, tts: 10000, total: 30000 };

  return (
    <>
      <div className="page-hero">
        <p className="eyebrow">Voice interface layer</p>
        <h1>VoiceForge</h1>
        <p className="subtitle">
          Real-time voice triage — browser ASR, governed LLM triage, and TTS with latency budgets
          and graceful degradation when a phase exceeds budget.
        </p>
      </div>

      {config && (
        <div className="panel">
          <span className="badge">ASR: {config.asr_mode}</span>
          <span className="badge">LLM: {config.llm_mode}</span>
          <span className="badge">TTS: {config.tts_mode}</span>
          <label style={{ marginTop: '0.75rem' }}>
            <input
              type="checkbox"
              checked={useWs}
              onChange={(e) => setUseWs(e.target.checked)}
              style={{ width: 'auto', marginRight: '0.5rem' }}
            />
            Use WebSocket transport
          </label>
        </div>
      )}

      <div className="panel">
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
          <button type="button" className="secondary" onClick={() => void loadReplay()} disabled={loading}>
            Replay last
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
        {error && <p className="error">{error}</p>}
      </div>

      {result && (
        <>
          <div className="panel">
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Latency waterfall</h2>
            <Waterfall latency={result.latency} budgets={budgets} />
            {result.degradation !== 'none' && (
              <p className="degraded">⚠ {result.degradation_message || result.degradation}</p>
            )}
          </div>

          <div className="panel">
            <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Transcript</h2>
            <p>{result.transcript || '—'}</p>
            <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Reply</h2>
            <p>{result.reply}</p>
            {triagePretty && (
              <>
                <h2 style={{ fontSize: '1rem', margin: '1rem 0 0.5rem' }}>Triage JSON</h2>
                <pre className="triage">{triagePretty}</pre>
              </>
            )}
          </div>

          <div className="panel">
            <table className="status-table">
              <thead>
                <tr>
                  <th>Phase</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(result.sources).map(([phase, source]) => (
                  <tr key={phase}>
                    <td>{phase.toUpperCase()}</td>
                    <td>{source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="panel">
        <table className="status-table">
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
      </div>
    </>
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
