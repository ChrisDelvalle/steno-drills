import { useState } from 'react';
import { useApp } from '../context';
import { eligibleWords, evaluate, parseWordList } from '../domain/vocabulary';
import { validateCorrection } from '../domain/profile';
import { conceptLabel } from '../domain/concepts';
import { Icon } from '../components';
import type { WordCorrection } from '../domain/types';

export function ExercisesView() {
  const { profile, setProfile, wordMap, words, goPractice } = useApp();
  const [editing, setEditing] = useState('');
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [correction, setCorrection] = useState(() => new URLSearchParams(window.location.hash.split('?')[1]).get('word') || '');
  const parsed = parseWordList(text);
  const available = parsed.filter(w => { const entry = wordMap.get(w); return entry && evaluate(entry, profile.learned, profile.excluded).eligible; });
  const unresolved = parsed.filter(w => !wordMap.has(w));
  const saveList = () => {
    if (!name.trim() || !parsed.length) return;
    const list = { id: editing || crypto.randomUUID(), name: name.trim(), words: parsed };
    setProfile(p => ({ ...p, lists: editing ? p.lists.map(l => l.id === editing ? list : l) : [...p.lists, list] }));
    setMessage(`Saved “${list.name}” with ${parsed.length} words.`); setEditing(''); setName(''); setText('');
  };
  return <>
    <section className="card">
      <form onSubmit={e => { e.preventDefault(); saveList(); }}><label className="field">List name<input value={name} onChange={e => setName(e.target.value)} placeholder="A to Z · this week’s words" maxLength={80} required/></label><label className="field">Words<textarea value={text} onChange={e => setText(e.target.value)} placeholder={'bad dim name\nfeet like judge'} rows={6} maxLength={100000} required/><span className="field-help">Spaces, commas, or new lines. Duplicates are removed.</span></label>
        {parsed.length > 0 && <div className="list-review"><strong>{parsed.length} words · {available.length} ready</strong><p className="small muted">{parsed.length - available.length} need concepts or review.</p>{unresolved.length > 0 && <p className="small">Not in the dictionary: {unresolved.slice(0, 20).map((w, i) => <span key={w}>{i > 0 ? ', ' : ''}<button type="button" className="text-button" onClick={() => setCorrection(w)}>{w}</button></span>)}{unresolved.length > 20 ? '…' : ''}. Add a correction below.</p>}</div>}
        <div className="button-row"><button className="primary" disabled={!name.trim() || !parsed.length || parsed.length > 5000 || (!editing && profile.lists.length >= 100)}>{editing ? 'Save changes' : 'Save word list'} <Icon name="plus" size={16}/></button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(''); setName(''); setText(''); }}>Cancel edit</button>}</div>{parsed.length > 5000 && <p role="alert">Use at most 5,000 words per list.</p>}
      </form>{message && <p className="small success" role="status">{message}</p>}
    </section>
    <section className="collection-section" aria-label="Word lists">{!profile.lists.length ? null : <div className="saved-grid">{profile.lists.map(list => {
      const ready = list.words.filter(w => { const entry = wordMap.get(w); return entry && evaluate(entry, profile.learned, profile.excluded).eligible; }).length;
      return <article className="card saved-card" key={list.id}><div className="saved-name"><strong>{list.name}</strong><span className="muted small">Word list</span></div><p className="small muted">{list.words.length} words · {ready} ready</p><p className="list-sample">{list.words.slice(0, 8).join(' · ')}{list.words.length > 8 ? ' …' : ''}</p><div className="button-row"><button className="secondary small" onClick={() => goPractice(`list:${list.id}`)}>Practice <Icon name="arrow" size={15}/></button><button className="text-button small" onClick={() => { setEditing(list.id); setName(list.name); setText(list.words.join('\n')); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Edit</button><button className="text-button small" onClick={() => { setProfile(p => ({ ...p, lists: p.lists.filter(l => l.id !== list.id) })); setMessage(`Removed “${list.name}”.`); }}>Remove</button></div></article>;
    })}</div>}</section>
    <section className="collection-section" aria-label="Saved filters"><div className="panel-toolbar"><a href="#/words" className="text-link">Save a word-bank filter <Icon name="plus" size={16}/></a></div><div className="saved-grid">{profile.exercises.map(exercise => <article className="card saved-card" key={exercise.id}><div className="saved-name"><strong>{exercise.name}</strong><span className="muted small">Saved filter</span></div><p className="small muted">{eligibleWords(words, profile, exercise.filter).length} words ready · {exercise.filter.pool === 'common' ? 'Common' : 'Entire dictionary'}</p><p className="small">{exercise.filter.focus ? conceptLabel(exercise.filter.focus) : 'All learned concepts'} · {exercise.filter.minLength}–{exercise.filter.maxLength} letters</p><div className="button-row"><button className="secondary small" onClick={() => goPractice(`filter:${exercise.id}`)}>Practice <Icon name="arrow" size={15}/></button><button className="text-button small" onClick={() => { setProfile(p => ({ ...p, filter: { ...exercise.filter } })); window.location.hash = '/words'; }}>Edit filters</button><button className="text-button small" onClick={() => setProfile(p => ({ ...p, exercises: p.exercises.filter(e => e.id !== exercise.id) }))}>Remove</button></div></article>)}</div></section>
    <details className="card correction-section" open={Boolean(correction)}><summary>Correct a dictionary entry</summary><CorrectionEditor key={correction} initialWord={correction} onSaved={word => { setCorrection(''); setMessage(`Saved personal metadata for “${word}”.`); }}/>
      {profile.corrections.length > 0 && <div className="correction-list">{profile.corrections.map(c => <div key={c.word}><button className="word-button" onClick={() => setCorrection(c.word)}>{c.word}</button><code>{c.outlines.join(', ')}</code><button className="text-button small" onClick={() => setProfile(p => ({ ...p, corrections: p.corrections.filter(w => w.word !== c.word) }))}>Restore bundled entry</button></div>)}</div>}
    </details>
  </>;
}

function CorrectionEditor({ initialWord, onSaved }: { initialWord: string; onSaved: (word: string) => void }) {
  const { profile, setProfile, wordMap } = useApp();
  const current = profile.corrections.find(c => c.word === initialWord);
  const initial = wordMap.get(initialWord);
  const [word, setWord] = useState(initialWord);
  const [outlines, setOutlines] = useState(current?.outlines.join(', ') || initial?.outlines.map(a => a.outline).join(', ') || '');
  const [syllables, setSyllables] = useState(current?.syllables || initial?.syllables[0] || 1);
  const [pronunciation, setPronunciation] = useState(current?.pronunciation || initial?.pronunciations[0]?.join(' ') || '');
  const [error, setError] = useState('');
  const loadWord = (value: string) => {
    const lower = value.toLowerCase().trim(); setWord(lower);
    const c = profile.corrections.find(c => c.word === lower), entry = wordMap.get(lower);
    setOutlines(c?.outlines.join(', ') || entry?.outlines.map(a => a.outline).join(', ') || '');
    setSyllables(c?.syllables || entry?.syllables[0] || 1); setPronunciation(c?.pronunciation || entry?.pronunciations[0]?.join(' ') || '');
  };
  const save = () => {
    try {
      const next: WordCorrection = validateCorrection({ word: word.toLowerCase().trim(), outlines: outlines.toUpperCase().split(',').map(s => s.trim()).filter(Boolean), syllables, pronunciation });
      if (!profile.corrections.some(c => c.word === next.word) && profile.corrections.length >= 5000) throw new Error('Maximum 5,000 corrections reached.');
      setProfile(p => ({ ...p, corrections: [...p.corrections.filter(c => c.word !== next.word), next] })); setError(''); onSaved(next.word);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save correction.'); }
  };
  return <form onSubmit={e => { e.preventDefault(); save(); }}><div className="correction-fields"><label>Word<input value={word} onChange={e => loadWord(e.target.value)} maxLength={100} placeholder="dim" required/></label><label>Machine steno outlines<input value={outlines} onChange={e => setOutlines(e.target.value)} maxLength={3000} placeholder="TKEUPL" required/><span className="field-help">Comma-separated alternatives; / separates strokes.</span></label><label>Syllables<input type="number" min={1} max={20} value={syllables} onChange={e => setSyllables(Number(e.target.value))}/></label></div><label className="field">Pronunciation (CMU/ARPAbet)<input className="mono" value={pronunciation} onChange={e => setPronunciation(e.target.value)} maxLength={500} placeholder="D IH1 M"/><span className="field-help">New words need a pronunciation for automatic filtering. Blank retains the bundled pronunciation.</span></label>{error && <p className="error" role="alert">{error}</p>}<button className="secondary">Save correction</button></form>;
}
