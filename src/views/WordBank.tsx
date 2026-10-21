import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context';
import { conceptLabel } from '../domain/concepts';
import { eligibleWords, evaluate, evaluateForFocus, matchesFilter } from '../domain/vocabulary';
import { Empty, FilterControls, Icon, StenoKeyboard } from '../components';
import type { WordEntry } from '../domain/types';

function WordDetails({ entry, onClose }: { entry: WordEntry; onClose: () => void }) {
  const { profile, setProfile } = useApp();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, [entry.word]);
  const result = evaluate(entry, profile.learned, profile.excluded);
  const excluded = profile.excluded.includes(entry.word);
  return <section className="card word-details" ref={ref} tabIndex={-1} aria-label={`Details for ${entry.word}`} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
    <div className="panel-toolbar"><strong>{entry.word}</strong><button className="secondary small" onClick={onClose}>Close details</button></div>
    <p className="small">{result.reason}{result.missing.length ? `: ${result.missing.map(conceptLabel).join(', ')}.` : ''}</p>
    <StenoKeyboard outline={result.outline || entry.outlines[0]?.outline}/>
    <p className="small muted">Syllables: {entry.syllables.join(' or ') || 'unknown'} · {entry.rank === undefined ? 'Full dictionary' : `Common vocabulary #${entry.rank + 1}`}</p>
    <div className="outline-list">{entry.outlines.map(analysis => <div key={analysis.outline}><code>{analysis.outline}</code><span>{analysis.requirements.length ? analysis.requirements.map((requirements, i) => <span key={i} className="rule-line">{requirements.map(conceptLabel).join(' + ')}</span>) : analysis.reason}</span></div>)}</div>
    <details><summary>Pronunciations (CMU/ARPAbet)</summary><p className="mono small">{entry.pronunciations.map(p => p.join(' ')).join(' / ') || 'No pronunciation available. Add a personal correction to explain this word.'}</p></details>
    <div className="button-row"><button className="secondary" onClick={() => setProfile(p => ({ ...p, excluded: excluded ? p.excluded.filter(w => w !== entry.word) : [...p.excluded, entry.word] }))}>{excluded ? 'Include in automatic practice' : 'Exclude from automatic practice'}</button><a href={`#/exercises?word=${encodeURIComponent(entry.word)}`}>Correct this entry →</a></div>
  </section>;
}

export function WordBankView() {
  const { profile, setProfile, words, goPractice } = useApp();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ready');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [saveName, setSaveName] = useState('');
  const [message, setMessage] = useState('');
  const filter = profile.filter;
  const ready = useMemo(() => eligibleWords(words, profile), [words, profile.learned, profile.excluded, filter]);
  const readyMap = useMemo(() => new Map(ready.map(w => [w.word, w])), [ready]);
  const matches = useMemo(() => words.filter(entry => {
    if (query && !entry.word.includes(query.toLowerCase().trim())) return false;
    const filterResult = evaluateForFocus(entry, profile, filter.focus);
    if (!matchesFilter(entry, filterResult, filter)) return false;
    return status === 'all' || (status === 'ready' ? readyMap.has(entry.word) : !readyMap.has(entry.word));
  }).sort((a, b) => filter.pool === 'common' ? (a.rank ?? Infinity) - (b.rank ?? Infinity) : a.word.localeCompare(b.word)), [words, query, status, profile.learned, profile.excluded, filter, readyMap]);
  const shown = matches.slice((page - 1) * 40, page * 40);
  const selectedEntry = words.find(w => w.word === selected);
  const save = () => {
    if (!saveName.trim()) return;
    const id = crypto.randomUUID();
    setProfile(p => ({ ...p, exercises: [...p.exercises, { id, name: saveName.trim(), filter: { ...filter } }] }));
    setMessage(`Saved “${saveName.trim()}”. It will grow as you learn.`); setSaveName('');
  };
  return <>
    <div className="view-toolbar"><button className="primary" disabled={!ready.length} onClick={() => goPractice('bank')}>Practice {ready.length} words <Icon name="arrow"/></button></div>
    <section className="card filter-card"><FilterControls filter={filter} onChange={filter => { setProfile(p => ({ ...p, filter })); setPage(1); }}/><div className="filter-bottom"><span className="small muted">Automatic practice · single syllable · single stroke</span><form className="inline-form" onSubmit={e => { e.preventDefault(); save(); }}><input aria-label="Saved filter name" maxLength={80} value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name this filter…"/><button className="secondary small" disabled={!saveName.trim() || profile.exercises.length >= 100}>Save filter</button></form></div>{message && <p className="success small" role="status">{message}</p>}</section>
    <div className="table-toolbar"><label className="search-field"><span className="sr-only">Search word bank</span><input type="search" placeholder="Find a word…" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}/></label><label className="status-filter"><span className="sr-only">Word status</span><select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}><option value="ready">Ready to practice</option><option value="locked">Still to learn / review</option><option value="all">All matching words</option></select></label><span className="small muted">{matches.length.toLocaleString()} words</span></div>
    <section className="card table-card">{!matches.length ? <Empty title="No words in this view">Try the entire dictionary, clear the focus, or change the status filter. Unexplained words stay out of automatic practice until reviewed.</Empty> : <><div className="table-scroll"><table><thead><tr><th>Word</th><th>Outline</th><th>Status</th><th><span className="sr-only">Details</span></th></tr></thead><tbody>{shown.map(entry => {
      const result = evaluateForFocus(entry, profile, filter.focus);
      const readyWord = readyMap.get(entry.word);
      return <tr key={entry.word}><td><button className="word-button" onClick={() => setSelected(entry.word)}>{entry.word}</button></td><td><code>{readyWord?.outline || result.outline || entry.outlines[0]?.outline}</code></td><td><span className={`status-label ${readyWord ? 'ready' : ''}`}>{readyWord ? 'Ready' : result.missing.length ? `Learn ${result.missing.map(conceptLabel).join(', ')}` : result.reason}</span></td><td><button className="text-button small" onClick={() => setSelected(entry.word)}>Inspect <span aria-hidden="true">↗</span></button></td></tr>;
    })}</tbody></table></div><div className="pagination"><span>{(page - 1) * 40 + 1}–{Math.min(page * 40, matches.length)} of {matches.length}</span><div><button className="secondary small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button><button className="secondary small" disabled={page * 40 >= matches.length} onClick={() => setPage(p => p + 1)}>Next</button></div></div></>}</section>
    {selectedEntry && <WordDetails entry={selectedEntry} onClose={() => setSelected('')}/>}
  </>;
}
