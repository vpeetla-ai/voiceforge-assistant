"use client";

import type { ReactNode } from "react";
import { ArchitectRail, type ArchitectRailProps } from "./ArchitectRail";
import { VoicePipelineGlassbox, type PipelineInput } from "./VoicePipelineGlassbox";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  architect: ArchitectRailProps;
  pipeline: PipelineInput | null;
  traceSource: "idle" | "live" | "replay";
  productPanel: ReactNode;
  secondaryPanel?: ReactNode;
  metricsRefreshToken?: number;
  onReplayDone?: () => void;
};

export function GlassboxWorkbench({
  eyebrow,
  title,
  subtitle,
  architect,
  pipeline,
  traceSource,
  productPanel,
  secondaryPanel,
  metricsRefreshToken = 0,
  onReplayDone,
}: Props) {
  return (
    <div className="gb-shell">
      <div className="gb-hero">
        <p className="workbench-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{subtitle}</p>
      </div>

      <div className="gb-workbench">
        <aside className="gb-rail" aria-label="Architecture and metrics">
          <ArchitectRail {...architect} refreshToken={metricsRefreshToken} />
        </aside>

        <section className="gb-center" aria-label="Voice pipeline glass-box">
          <VoicePipelineGlassbox
            input={pipeline}
            traceSource={traceSource}
            onReplayDone={onReplayDone}
          />
        </section>

        <aside className="gb-product" aria-label="Voice triage product">
          {productPanel}
        </aside>
      </div>

      {secondaryPanel ? <div className="gb-secondary">{secondaryPanel}</div> : null}
    </div>
  );
}
