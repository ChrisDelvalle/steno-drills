import { useEffect, useRef, useState } from 'react';
import type { SessionConfig } from '../context';
import { generateWords, scoreInput } from '../domain/practice';
import { Icon, StenoKeyboard } from '../components';

const makeTargets = (c: SessionConfig) => c.kind === 'text' ? c.pool : generateWords(c.pool, c.mode === 'timed' ? 200 : c.count);
const timeText = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export function PracticeSession({ config, onExit }: { config: SessionConfig; onExit: () => void }) {
  const [active, setActive] = useState(config);
  const [targets, setTargets] = useState(() => makeTargets(config));
  const [input, setInput] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const score = scoreInput(targets, input, elapsed);
  const remaining = Math.max(0, active.duration * 1000 - elapsed);
  const current = targets[score.current];
  const reset = (next: SessionConfig = active) => {
    setActive(next); setTargets(makeTargets(next)); setInput(''); setStartedAt(null); setElapsed(0); setFinished(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (startedAt === null || finished) return;
    const timer = window.setInterval(() => {
      const ms = performance.now() - startedAt;
      setElapsed(active.mode === 'timed' ? Math.min(ms, active.duration * 1000) : ms);
      if (active.mode === 'timed' && ms >= active.duration * 1000) setFinished(true);
    }, 100);
    return () => window.clearInterval(timer);
  }, [startedAt, finished, active.mode, active.duration]);
  useEffect(() => {
    if (score.done && !finished && startedAt !== null) { setElapsed(performance.now() - startedAt); setFinished(true); }
  }, [score.done, finished, startedAt]);
  useEffect(() => {
    if (active.mode === 'timed' && active.kind !== 'text' && !finished && score.completed > targets.length - 40) {
      setTargets(previous => [...previous, ...generateWords(active.pool, 200)]);
    }
  }, [score.completed, targets.length, active, finished]);
  useEffect(() => { if (finished) resultsRef.current?.focus(); }, [finished]);
  const rate = active.kind === 'chords' ? (elapsed > 0 ? score.correct / (elapsed / 60000) : 0) : score.wpm;
  const missed = [...new Map(score.missed.map(w => [w.word, w])).values()];
  const finish = () => { if (startedAt !== null) { setElapsed(performance.now() - startedAt); setFinished(true); } };
  const startIndex = Math.max(0, score.current - 6);
  return <main className="session-shell" onKeyDown={e => {
    if (e.key === 'Escape') onExit();
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); reset(); }
  }}>
    <header className="session-header"><button className="text-button" onClick={onExit}><Icon name="back"/>Back to setup</button><a className="session-brand" href="#/practice" onClick={e => { e.preventDefault(); onExit(); }}>Steno Drills</a><button className="secondary small" onClick={() => reset()}><Icon name="refresh" size={15}/>Restart</button></header>
    {!finished ? <>
      <div className="session-title"><p>{active.title}</p>{(active.kind === 'chords' || active.unrestricted) && <span className="muted small">{active.kind === 'chords' ? 'Raw steno' : 'Unrestricted'}</span>}</div>
      <div className="session-meters"><div><span>{active.mode === 'timed' ? 'TIME LEFT' : 'ELAPSED'}</span><strong aria-label={active.mode === 'timed' ? 'Time left' : 'Elapsed time'}>{timeText(active.mode === 'timed' ? remaining : elapsed)}</strong></div><div><span>{active.kind === 'chords' ? 'CHORDS / MIN' : 'CORRECT WPM'}</span><strong>{Math.round(rate)}</strong></div><div><span>WORD ACCURACY</span><strong>{Math.round(score.accuracy)}<small>%</small></strong></div></div>
      <div className="card practice-surface"><div className="target-words" aria-label="Practice passage">{targets.slice(startIndex, score.current + 35).map((target, offset) => {
        const i = startIndex + offset, typed = score.tokens[i];
        const correct = typed?.toLowerCase() === target.word.toLowerCase();
        const partial = i === score.current && target.word.toLowerCase().startsWith(typed?.toLowerCase() || '');
        return <span key={i} className={`${i < score.completed ? correct ? 'correct' : 'incorrect' : i === score.current ? partial ? 'current-word' : 'current-word incorrect' : ''}`}>{target.word} </span>;
      })}</div><label className="practice-input-label">{active.kind === 'chords' ? 'Plover raw steno input' : 'Your Plover text'}<textarea ref={inputRef} aria-label="Practice input" autoCapitalize="off" autoCorrect="off" spellCheck={false} rows={3} value={input} onChange={e => {
        const value = e.target.value;
        if (startedAt === null && value.trim()) setStartedAt(performance.now());
        setInput(value);
      }} placeholder={active.kind === 'chords' ? 'Send raw steno here…' : 'Write the words above…'}/></label></div>
      {active.hints && <div className="session-hint"><div><p><strong>{current?.word}</strong><code>{current?.outline || 'No dictionary hint'}</code></p><p className="small muted">{active.kind === 'chords' ? 'Use Plover with translating dictionaries disabled.' : 'Translated text does not verify physical chords.'}</p></div><StenoKeyboard outline={current?.outline}/></div>}
      <div className="session-bottom"><span>{score.completed} {active.kind === 'chords' ? 'chords' : 'words'} submitted{active.mode === 'count' ? ` of ${targets.length}` : ''}</span><button className="text-button small" onClick={finish} disabled={startedAt === null}>Finish session</button><span className="shortcut-note">Esc · exit &nbsp; ⌘/Ctrl Enter · restart</span></div>
    </> : <section className="session-results" tabIndex={-1} ref={resultsRef} aria-label="Practice results">
      <p className="muted">{active.title} · {timeText(elapsed)}</p><div className="results-grid"><div><strong>{Math.round(rate)}</strong><span>{active.kind === 'chords' ? 'correct chords / min' : 'correct WPM'}</span></div><div><strong>{Math.round(score.accuracy)}%</strong><span>submitted word accuracy</span></div><div><strong>{score.correct}</strong><span>correct {active.kind === 'chords' ? 'chords' : 'words'}</span></div></div>
      <p className="small muted">{active.kind === 'chords' ? 'Chord rate counts correct submitted chord shapes.' : 'WPM = correct submitted characters ÷ 5 ÷ minutes.'} Accuracy includes corrections; unfinished input is excluded.</p>
      {missed.length > 0 ? <div className="card missed-words"><div className="word-chips">{missed.map(w => <span key={w.word}>{w.word}</span>)}</div><button className="secondary" onClick={() => reset({ ...active, title: 'Missed words', kind: active.kind === 'chords' ? 'chords' : 'words', pool: missed, mode: 'count', count: Math.max(10, missed.length) })}>Practice missed words <Icon name="arrow" size={17}/></button></div> : <p className="success">{score.completed ? 'No missed words.' : 'No submitted words.'}</p>}
      <div className="button-row center"><button className="primary" onClick={() => reset()}>Practice again <Icon name="refresh" size={17}/></button><button className="secondary" onClick={onExit}>Back to setup</button></div>
    </section>}
  </main>;
}
