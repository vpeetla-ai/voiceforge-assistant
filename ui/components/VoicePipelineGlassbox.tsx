"use client";

import { useEffect, useRef, useState } from "react";

export type Latency = {
  asr_ms: number;
  llm_ttft_ms: number;
  llm_total_ms: number;
  tts_ms: number;
  total_ms: number;
};

export type PipelineInput = {
  latency: Latency;
  budgets: Record<string, number>;
  sources: Record<string, string>;
  degradation: string;
  degradationMessage: string;
  config: { asr_mode: string; llm_mode: string; tts_mode: string } | null;
};

type Stage = {
  id: "asr" | "llm" | "tts";
  label: string;
  ms: number;
  budget: number;
  source?: string;
  note: string;
};

type Props = {
  input: PipelineInput | null;
  traceSource: "idle" | "live" | "replay";
  onReplayDone?: () => void;
};

const STAGE_META: { id: Stage["id"]; label: string; x: number }[] = [
  { id: "asr", label: "ASR", x: 20 },
  { id: "llm", label: "LLM triage", x: 200 },
  { id: "tts", label: "TTS", x: 380 },
];

function buildStages(input: PipelineInput): Stage[] {
  const { latency, budgets, sources, config } = input;
  return [
    {
      id: "asr",
      label: "ASR",
      ms: latency.asr_ms,
      budget: budgets.asr ?? 8000,
      source: sources.asr,
      note: `Speech → text · ${config?.asr_mode ?? "browser"}`,
    },
    {
      id: "llm",
      label: "LLM triage",
      ms: latency.llm_total_ms,
      budget: budgets.llm ?? 15000,
      source: sources.llm,
      note: `Governed triage · TTFT ${latency.llm_ttft_ms.toFixed(0)}ms · ${config?.llm_mode ?? "mock"}`,
    },
    {
      id: "tts",
      label: "TTS",
      ms: latency.tts_ms,
      budget: budgets.tts ?? 10000,
      source: sources.tts,
      note: `Text → speech · ${config?.tts_mode ?? "browser"}`,
    },
  ];
}

export function VoicePipelineGlassbox({ input, traceSource, onReplayDone }: Props) {
  const [activeStage, setActiveStage] = useState<Stage["id"] | null>(null);
  const [doneStages, setDoneStages] = useState<Set<string>>(new Set());
  const [gate, setGate] = useState(
    "ASR → governed LLM → TTS — each stage runs under a hard latency budget with graceful degradation."
  );
  const [eventLog, setEventLog] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveStage(null);
    setDoneStages(new Set());
    setEventLog([]);

    if (!input) {
      setGate(
        "ASR → governed LLM → TTS — each stage runs under a hard latency budget with graceful degradation."
      );
      return;
    }

    const stages = buildStages(input);
    let i = 0;
    let prev: Stage["id"] | null = null;

    const step = () => {
      if (i >= stages.length) {
        if (prev) setDoneStages((prev2) => new Set(prev2).add(prev!));
        setActiveStage(null);
        if (input.degradation && input.degradation !== "none") {
          setGate(`⚠ Degraded — ${input.degradationMessage || input.degradation}`);
        } else {
          setGate(`Turn complete — ${input.latency.total_ms.toFixed(0)}ms end to end, all budgets met.`);
        }
        onReplayDone?.();
        return;
      }
      const s = stages[i];
      if (prev) setDoneStages((prevSet) => new Set(prevSet).add(prev!));
      setActiveStage(s.id);
      prev = s.id;
      const over = s.ms > s.budget ? " ⚠ over budget" : "";
      setGate(`${s.label} — ${s.note}${over}`);
      setEventLog((log) => [
        ...log,
        `▸ voice.${s.id} ${s.ms.toFixed(0)}ms / ${s.budget}ms${s.source ? ` · ${s.source}` : ""}`,
      ]);
      i += 1;
      timerRef.current = setTimeout(step, traceSource === "replay" ? 420 : 480);
    };

    step();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replay on new input only
  }, [input, traceSource]);

  const stages = input ? buildStages(input) : [];
  const maxMs = Math.max(
    input?.latency.total_ms ?? 0,
    input?.budgets.total ?? 30000,
    1
  );

  return (
    <>
      <div className="gb-center-head">
        <h2>Voice pipeline · phase replay</h2>
        <span
          className={`gb-source-badge${
            traceSource === "live" ? " live" : traceSource === "replay" ? " fallback" : ""
          }`}
        >
          {traceSource === "live"
            ? "live latency"
            : traceSource === "replay"
              ? "replay"
              : "awaiting turn"}
        </span>
      </div>

      <svg className="gb-pipeline-svg" viewBox="0 0 480 130" role="img" aria-label="ASR to LLM to TTS pipeline">
        <defs>
          <marker id="vf-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="var(--vp-border-strong)" />
          </marker>
        </defs>
        {STAGE_META.map((n) => (
          <g
            key={n.id}
            className={`gb-node${
              activeStage === n.id ? " gb-active" : doneStages.has(n.id) ? " gb-done" : ""
            }`}
          >
            <rect x={n.x} y={45} width="80" height="42" rx="9" />
            <text x={n.x + 40} y={70} textAnchor="middle">
              {n.label}
            </text>
          </g>
        ))}
        <path className="gb-edge" d="M100 66 H200" markerEnd="url(#vf-arrow)" />
        <path className="gb-edge" d="M280 66 H380" markerEnd="url(#vf-arrow)" />
      </svg>

      <div className="gb-pills">
        {STAGE_META.map((s, i) => (
          <span key={s.id}>
            {i > 0 ? <span className="gb-pill-arrow">→</span> : null}
            <span
              className={`gb-pill${
                activeStage === s.id ? " gb-active" : doneStages.has(s.id) ? " gb-done" : ""
              }`}
            >
              {s.label}
            </span>
          </span>
        ))}
      </div>

      {stages.length > 0 ? (
        <div className="gb-waterfall">
          {stages.map((s) => {
            const over = s.ms > s.budget;
            return (
              <div key={s.id} className="gb-wf-row">
                <span className="gb-wf-label">{s.label}</span>
                <div className="gb-wf-track">
                  <div
                    className={`gb-wf-bar${over ? " over" : ""}${
                      doneStages.has(s.id) || activeStage === s.id ? " filled" : ""
                    }`}
                    style={{ width: `${Math.min(100, Math.max(3, (s.ms / maxMs) * 100))}%` }}
                  />
                  <div
                    className="gb-wf-budget"
                    style={{ left: `${Math.min(100, (s.budget / maxMs) * 100)}%` }}
                    title={`budget ${s.budget}ms`}
                  />
                </div>
                <span className={`gb-wf-ms${over ? " over" : ""}`}>{s.ms.toFixed(0)}ms</span>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="gb-gate">{gate}</div>
      <div className="gb-event-log" aria-live="polite">
        {eventLog.length === 0 ? (
          <div className="muted" style={{ fontStyle: "italic" }}>
            Run a voice turn to replay ASR → LLM → TTS latency…
          </div>
        ) : (
          eventLog.map((line, idx) => (
            <div key={`${line}-${idx}`} className="ev-live">
              {line}
            </div>
          ))
        )}
      </div>
      <div className="gb-ops-strip">
        <span>
          <strong>stages</strong> {stages.length || 3}
        </span>
        <span>
          <strong>total</strong> {input ? `${input.latency.total_ms.toFixed(0)} ms` : "n/a"}
        </span>
        <span>
          <strong>TTFT</strong> {input ? `${input.latency.llm_ttft_ms.toFixed(0)} ms` : "n/a"}
        </span>
        <span>
          <strong>degradation</strong> {input ? input.degradation : "none"}
        </span>
      </div>
    </>
  );
}
