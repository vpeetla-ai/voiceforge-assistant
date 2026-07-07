import Link from 'next/link';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="app-header">
        <div className="app-header__inner">
          <Link href="/" className="brand">
            <div className="brand__mark">VF</div>
            <div className="brand__text">
              <p className="brand__eyebrow">Real-time voice triage</p>
              <p className="brand__title">VoiceForge</p>
            </div>
          </Link>
          <div className="header-actions">
            <span className="status-badge">Live API</span>
            <a
              href="https://github.com/vpeetla-ai/voiceforge-assistant"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', textDecoration: 'none' }}
            >
              GitHub
            </a>
          </div>
        </div>
      </header>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        VoiceForge · ASR → LLM → TTS ·{' '}
        <a href="https://github.com/vpeetla-ai/voiceforge-assistant">vpeetla-ai</a>
      </footer>
    </>
  );
}
