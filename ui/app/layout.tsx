import type { Metadata } from 'next';
import { AppShell } from '../components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'VoiceForge — Real-Time Voice Triage',
  description: 'ASR → LLM → TTS pipeline with latency budgets and graceful degradation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
