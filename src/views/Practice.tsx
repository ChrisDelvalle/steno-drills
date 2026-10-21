import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { concepts, conceptLabel } from '../domain/concepts';
import { eligibleWords, evaluate } from '../domain/vocabulary';
import type { PracticeWord } from '../domain/types';
import { Empty, FilterControls, Icon, StenoKeyboard } from '../components';

export function PracticeView() {
  const { profile, setProfile, words, wordMap, source, setSource, startSession } = useApp();
  const [kind, setKind] = useState<'words' | 'chords' | 'text'>('words');
  const [restricted, setRestricted] = useState(true);
  const list = profile.lists.find(l => `list:${l.id}` === source);
  const saved = profile.exercises.find(e => `filter:${e.id}` === source);
  const filter = saved?.filter || profile.filter;
  const pool = useMemo<PracticeWord[]>(() => {
    if (kind === 'text') return profile.customText.trim().split(/\s+/).filter(Boolean).map(word => ({ word, outline: wordMap.get(word.toLowerCase())?.outlines[0]?.outline }));
    if (kind === 'chords') return [...new Map(concepts.filter(c => c.bank !== 'brief' && profile.learned.includes(c.id)).map(c => [c.keys, { word: c.keys, outline: c.keys }])).values()];
    if (list) return list.words.flatMap(word => {
      const entry = wordMap.get(word);
      const result = entry ? evaluate(entry, profile.learned, profile.excluded) : null;
      if (restricted) return result?.eligible ? [{ word, outline: result.outline }] : [];
      return [{ word, outline: entry?.outlines[0]?.outline }];
    });
    return eligibleWords(words, profile, filter);
  }, [kind, profile, wordMap, list, restricted, filter, words]);
  const example = pool.find(w => w.word === 'name') || pool[0];
  const title = kind === 'text' ? 'Custom text' : kind === 'chords' ? 'Keyboard & chord drill' : list?.name || saved?.name || 'Everything I know';
  const session = profile.session;
  const updateSession = (patch: Partial<typeof session>) => setProfile(p => ({ ...p, session: { ...p.session, ...patch } }));
  const preview = kind === 'words' ? pool.slice(0, 12) : [];
  const start = () => startSession({ title, kind, pool, mode: session.mode, duration: session.duration, count: session.count, hints: session.hints, unrestricted: kind === 'text' || Boolean(list && !restricted) });
  return <>
    <div className="practice-layout">
      <section className="card setup-card" aria-label="Practice setup">
        <div className="segmented" aria-label="Practice type">{(['words', 'chords', 'text'] as const).map(k => <button key={k} aria-pressed={kind === k} onClick={() => setKind(k)}>{k === 'words' ? 'Words' : k === 'chords' ? 'Chords' : 'Custom text'}</button>)}</div>
        {kind === 'words' && <>
          <label className="field">Exercise<select value={source} onChange={e => setSource(e.target.value)}><option value="bank">Current word bank</option><optgroup label="Saved filters">{profile.exercises.map(e => <option key={e.id} value={`filter:${e.id}`}>{e.name}</option>)}</optgroup><optgroup label="Your word lists">{profile.lists.map(l => <option key={l.id} value={`list:${l.id}`}>{l.name}</option>)}</optgroup></select></label>
          {list ? <label className="check-line"><input type="checkbox" checked={restricted} onChange={e => setRestricted(e.target.checked)}/>Only use words explained by my learned concepts</label> : saved ? <p className="notice compact">Saved filter · {filter.pool === 'common' ? 'Common words' : 'Entire dictionary'} · {filter.focus ? conceptLabel(filter.focus) : 'All learned concepts'}<br/><a href="#/exercises">Manage saved filters</a></p> : <FilterControls lengths={false} filter={filter} onChange={filter => setProfile(p => ({ ...p, filter }))}/>}
          {list && <p className="small muted">{pool.length} of {list.words.length} list words available. <a href="#/exercises">Review the list</a></p>}
        </>}
        {kind === 'text' && <label className="field">Your text<textarea rows={6} maxLength={100000} value={profile.customText} onChange={e => setProfile(p => ({ ...p, customText: e.target.value }))} placeholder="Paste a passage you’d like to practice…"/><span className="field-help">Unrestricted. Case and extra whitespace are ignored.</span></label>}
        {kind === 'chords' && <div className="notice compact">Disable translating dictionaries in Plover for raw steno such as <code>TK</code> or <code>-PB</code>. Re-enable them for words.</div>}
        <hr/>
        <div className="session-options"><label>Session<select value={session.mode} onChange={e => updateSession({ mode: e.target.value as 'timed' | 'count' })}><option value="timed">Timed practice</option><option value="count">Word count</option></select></label><label>{session.mode === 'timed' ? 'Duration' : 'Length'}<select value={session.mode === 'timed' ? session.duration : session.count} onChange={e => updateSession(session.mode === 'timed' ? { duration: +e.target.value } : { count: +e.target.value })}>{session.mode === 'timed' ? [30,60,120,300].map(n => <option value={n} key={n}>{n < 60 ? `${n} seconds` : `${n / 60} minute${n > 60 ? 's' : ''}`}</option>) : [10,25,50,100,250,500].map(n => <option value={n} key={n}>{n} {kind === 'chords' ? 'chords' : 'words'}</option>)}</select></label></div>
        {kind === 'text' && <p className="small muted">Ends with the passage or timer.</p>}
        <label className="check-line"><input type="checkbox" checked={session.hints} onChange={e => updateSession({ hints: e.target.checked })}/>Show outline and keyboard hints</label>
        {!pool.length ? <Empty title="No matching words yet">Try a different pool or focus, add more <a href="#/skills">learned concepts</a>, or choose a custom exercise.</Empty> : <div className="pool-summary"><span className="status-dot"/>{pool.length.toLocaleString()} {kind === 'chords' ? 'chord shapes' : 'words'} ready {kind === 'words' && (!list || restricted) && <span className="tag">1 syllable · 1 stroke</span>}</div>}
        <button className="primary start-button" disabled={!pool.length} onClick={start}>Start practicing <Icon name="arrow"/></button>
        <p className="small muted center">Timer starts on first input.</p>
      </section>
      <aside className="practice-aside">
        <section className="card preview-card"><div className="preview-word">{example?.word || '—'}</div><code className="outline-large">{example?.outline || 'No outline'}</code><StenoKeyboard outline={example?.outline}/></section>

      </aside>
    </div>
    {preview.length > 0 && <section className="card word-preview"><div className="panel-toolbar"><a href="#/words" className="text-link">Word bank <Icon name="arrow" size={16}/></a></div><div className="word-chips">{preview.map(w => <span key={w.word}>{w.word}<code>{w.outline}</code></span>)}</div></section>}
  </>;
}
