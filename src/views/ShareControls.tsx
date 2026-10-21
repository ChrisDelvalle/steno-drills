import { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '../domain/types';
import { encodeSharedTest, normalizeSharedTest, sharedHash } from '../domain/sharing';
import { Icon } from '../components';

export function ShareControls({ profile, disabled }: { profile: Profile; disabled: boolean }) {
  const result = useMemo(() => normalizeSharedTest(profile), [profile]);
  const token = result.ok ? encodeSharedTest(result.value) : '';
  const destination = new URL(window.location.pathname, window.location.origin);
  destination.hash = sharedHash('practice', token);
  const url = token ? destination.href : '';
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { setCopied(false); setFallback(false); }, [token]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => { if (fallback) { input.current?.focus(); input.current?.select(); } }, [fallback]);
  return <div className="share-controls">
    <button className="secondary" disabled={disabled || !result.ok} aria-describedby={!result.ok ? 'share-unavailable' : undefined} onClick={async () => {
      try { await navigator.clipboard.writeText(url); setCopied(true); setFallback(false); }
      catch { setFallback(true); }
    }}><Icon name="share" size={17}/>{copied ? 'Copied' : 'Share'}</button>
    <span className="sr-only" role="status">{copied ? 'Link copied.' : ''}</span>
    {!result.ok && <span id="share-unavailable" className="small muted">{result.error}</span>}
    {fallback && <label className="share-fallback">Copy link<input ref={input} aria-label="Share link" readOnly value={url} onFocus={e => e.currentTarget.select()}/></label>}
  </div>;
}
