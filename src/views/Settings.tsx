import { useState } from 'react';
import { useApp } from '../context';
import { downloadFile, Icon } from '../components';
import { exportBackup, importBackup } from '../domain/profile';
import type { Profile } from '../domain/types';

export function SettingsView() {
  const { profile, setProfile, dictionary, replaceProfile, warning } = useApp();
  const [pending, setPending] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const report = dictionary.report;
  const readBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 5_000_000) throw new Error('Choose a backup smaller than 5 MB.');
      setPending(importBackup(await file.text())); setError(''); setMessage('');
    } catch (e) { setPending(null); setError(e instanceof Error ? e.message : 'The backup could not be read.'); }
  };
  return <>
    <section className="card"><fieldset className="theme-options"><legend>Theme</legend>{(['system', 'light', 'dark'] as const).map(theme => <label className={profile.theme === theme ? 'selected' : ''} key={theme}><input type="radio" name="theme" checked={profile.theme === theme} onChange={() => setProfile(p => ({ ...p, theme }))}/>{theme === 'system' ? 'Follow system' : `${theme[0].toUpperCase()}${theme.slice(1)}`}</label>)}</fieldset></section>
    <section className="card"><p className="small muted">Data is stored in this browser. Use backups to move it between devices or domains.</p><div className="button-row"><button className="primary" onClick={() => downloadFile(`steno-drills-backup-${new Date().toLocaleDateString('en-CA')}.json`, exportBackup(profile))}><Icon name="download" size={17}/>Export backup</button><label className="file-button secondary">Import backup<input type="file" accept="application/json,.json" onChange={e => { void readBackup(e.target.files?.[0]); e.target.value = ''; }}/></label></div>
      {error && <p className="error" role="alert">{error}</p>}{message && <p className="success" role="status">{message}</p>}
      {pending && <div className="import-preview" role="region" aria-label="Backup preview"><p>{pending.learned.length} learned concepts · {pending.lists.length} word lists · {pending.exercises.length} saved filters · {pending.corrections.length} corrections · {pending.excluded.length} exclusions</p><p className="small">This replaces your current profile. Export first to keep a copy.</p><div className="button-row"><button className="primary" onClick={() => { replaceProfile(pending); setPending(null); setMessage('Backup restored.'); }}>Replace current profile</button><button className="secondary" onClick={() => setPending(null)}>Cancel import</button></div></div>}
      {warning && <div className="notice warning"><p>Export first. Retrying will replace unreadable saved data with your current profile.</p><button className="secondary" onClick={() => replaceProfile(profile)}>Save current profile and retry storage</button></div>}
    </section>
    <details className="card"><summary>Dictionary sources</summary><p className="small muted">{report.entries.toLocaleString()} Plover entries · {report.classified.toLocaleString()} single-syllable words explained · {report.starterCommon} common words in the starter preset.</p><p className="small muted">{report.missingPronunciation.toLocaleString()} words lack pronunciations. {report.unexplained.toLocaleString()} have no explained outline. Ambiguous syllables and unsupported rules are excluded from automatic practice.</p><p className="small"><a href="sources.lock.json">Source revisions</a> · <a href="concept-audit.json">Concept audit</a> · <a href="THIRD_PARTY_NOTICES.txt">Licenses</a> · <a href="https://github.com/ChrisDelvalle/steno-jig" target="_blank" rel="noreferrer">Source code ↗</a></p></details>
    <section className="card" aria-label="Excluded words">{!profile.excluded.length ? null : <div className="word-chips">{profile.excluded.map(word => <button className="secondary small" key={word} onClick={() => setProfile(p => ({ ...p, excluded: p.excluded.filter(w => w !== word) }))}>{word} <span aria-label="Include again">×</span></button>)}</div>}</section>
  </>;
}
