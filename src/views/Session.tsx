import { lazy, Suspense, useEffect, useRef, useState, useCallback, useMemo, useLayoutEffect } from 'react';
import type { SessionConfig } from '../context';
import { burstSpeed, generateWords, inputMetrics, insertedText, practiceText, scoreInput, speedSample } from '../domain/practice';
import type { ErrorSample, SpeedSample, TypingEvent } from '../domain/practice';
import { Icon, StenoKeyboard, Brand } from '../components';
import { textTranslator } from '../domain/translation';
import { assistedPractice, projectWordPractice, wordPracticeDefaults, wordPracticeMetrics, scoreWordPractice, rebaseRecovery } from '../domain/wordPractice';
import { browserSpeech, PromptSpeaker } from '../domain/speech';
import type { SpeechAdapter } from '../domain/speech';
import { listeningDefaults } from '../domain/listening';
import { PracticeSurface } from './PracticeSurface';

const ResultsChart = lazy(() => import('./ResultsChart'));
const makeTargets = (c: SessionConfig) => c.ordered || c.kind === 'text' ? c.pool : generateWords(c.pool, c.mode === 'timed' ? 200 : c.count);

export function PracticeSession({ config, onExit, onOptionsChange, suspended = false, practiceHref = '#/practice', speechAdapter }: {
  speechAdapter?: SpeechAdapter; config: SessionConfig; onExit: () => void; onOptionsChange?: (options: { hints: boolean }) => void; suspended?: boolean; practiceHref?: string;
}) {
  const [active, setActive] = useState(config);
  const listening = active.listening || listeningDefaults();
  const audio = active.kind === 'words' && listening.enabled;
  const display = audio ? listening.display : 'full';
  const [speechError, setSpeechError] = useState('');
  const [activated, setActivated] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const epochRef = useRef(0);
  const inputAllowed = useRef(false);
  const [revealedPrompt, setRevealedPrompt] = useState('');
  const adapter = useMemo(() => speechAdapter || browserSpeech(), [speechAdapter]);
  const [targets, setTargets] = useState(() => makeTargets(config));
  const [input, setInput] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const history = useRef<SpeedSample[]>([]);
  const errors = useRef<ErrorSample[]>([]);
  const typing = useRef<TypingEvent[]>([]);
  const latestInput = useRef('');
  const playbackAllowed = useRef(true);
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;
  const recovery = useRef(new Map<number, number>());
  const options = useMemo(() => ({ ...wordPracticeDefaults(), inputMode: active.inputMode || 'text', groupSize: active.groupSize || 1, repetitions: active.repetitions || 1, requireCorrect: active.requireCorrect || false, repeatOnError: active.repeatOnError || false, errorRepetitions: active.errorRepetitions || 3 }), [active.inputMode, active.groupSize, active.repetitions, active.requireCorrect, active.repeatOnError, active.errorRepetitions]);
  const assisted = assistedPractice(options) || audio;
  const incorrectChars = useRef(0);
  const project = useCallback((value: string, finalized = false) => projectWordPractice(targets, (active.translator || textTranslator).translate(value, active.questionHints), options, finalized, recovery.current), [targets, active.translator, active.questionHints, options]);
  const projection = useMemo(() => assisted ? project(input) : undefined, [assisted, project, input]);
  const evaluate = (value: string, ms: number, finalized = finished) => assisted ? scoreWordPractice(project(value, finalized), targets, ms, errors.current.flatMap(e => e.mistakes), incorrectChars.current) : scoreInput(targets, practiceText(value, active.questionHints), ms);
  const score = evaluate(input, elapsed);
  const remaining = Math.max(0, active.duration * 1000 - elapsed);
  const prompt = projection?.prompt;
  const promptId = `${epoch}:${prompt?.id || '0:0'}`;
  useEffect(() => { setRevealedPrompt(''); }, [promptId]);
  const revealed = display !== 'hidden' || revealedPrompt === promptId;
  const hintsVisible = display === 'hidden' ? revealedPrompt === promptId : active.hints;
  const current = targets[audio ? projection?.hint || 0 : cursor];
  const speechCallbacks = useRef({ start: () => {}, error: (_message: string) => {} });
  speechCallbacks.current = {
    start: () => { const at = performance.now(); setSpeechError(''); setStartedAt(previous => previous ?? at); },
    error: message => { setSpeechError(message); setControlsHidden(false); },
  };
  const speaker = useMemo(() => new PromptSpeaker(adapter, { start: () => speechCallbacks.current.start(), error: message => speechCallbacks.current.error(message) }), [adapter]);
  // Keep the first cue queued while accepting early typing. An exact tail must
  // not cancel it before its start callback can establish the session clock.
  const spokenPrompt = !audio ? null : startedAt === null && targets.length ? {
    id: `${epoch}:0:0`, text: targets.slice(0, options.groupSize).map(w => w.word).join(' '),
  } : prompt && prompt.start < prompt.end ? { id: promptId, text: targets.slice(prompt.start, prompt.end).map(w => w.word).join(' ') } : null;
  useEffect(() => {
    speaker.update(!suspended && !finished ? spokenPrompt : null, active.voice || '', listening.rate, playbackAllowed.current && document.hasFocus() && document.visibilityState !== 'hidden');
  }, [speaker, spokenPrompt?.id, suspended, finished, active.voice, listening.rate]);
  useEffect(() => {
    const cancel = () => speaker.cancel();
    const visibility = () => { if (document.visibilityState === 'hidden') cancel(); };
    window.addEventListener('blur', cancel); window.addEventListener('pagehide', cancel); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', cancel); window.removeEventListener('pagehide', cancel); document.removeEventListener('visibilitychange', visibility); speaker.cancel(); };
  }, [speaker]);
  const play = () => {
    if (!spokenPrompt || suspended || finished) return;
    inputAllowed.current = true; playbackAllowed.current = true; setActivated(true); setSpeechError(''); speaker.play(spokenPrompt, active.voice || '', listening.rate); focus();
  };
  const capture = (ms: number, value = latestInput.current, finalized = false) => {
    const lastTime = history.current.at(-1)?.seconds || 0;
    const errorCount = errors.current.filter(e => (history.current.length === 0 ? e.seconds >= 0 : e.seconds > lastTime) && e.seconds <= ms / 1000).reduce((sum, e) => sum + e.count, 0);
    const measured = evaluate(value, ms, finalized);
    const point: SpeedSample = assisted ? { seconds: Math.round(ms / 100) / 10, wpm: measured.wpm, raw: measured.rawWpm, burst: burstSpeed(typing.current, ms), errors: errorCount } : speedSample(targets, practiceText(value, active.questionHints), ms, burstSpeed(typing.current, ms), errorCount);
    if (active.kind === 'chords') point.wpm = ms > 0 ? scoreInput(targets, value, ms).correct * 60_000 / ms : 0;
    const previous = history.current.at(-1);
    if (previous?.seconds === point.seconds) history.current[history.current.length - 1] = point;
    else history.current.push(point);
  };
  const focus = () => {
    if (!suspendedRef.current) inputRef.current?.focus();
    requestAnimationFrame(() => { if (!suspendedRef.current) inputRef.current?.focus(); });
  };
  const reset = (next: SessionConfig = active, replay = true) => {
    const nextTargets = makeTargets(next), nextEpoch = ++epochRef.current;
    const nextListening = next.listening || listeningDefaults();
    const startAudio = replay && next.kind === 'words' && nextListening.enabled && nextTargets.length > 0;
    inputAllowed.current = startAudio; playbackAllowed.current = replay;
    speaker.cancel(); setActivated(startAudio); setEpoch(nextEpoch); setSpeechError(''); setRevealedPrompt('');
    setActive(next); setTargets(nextTargets); setInput(''); latestInput.current = '';
    setStartedAt(null); setElapsed(0); setFinished(false); setControlsHidden(false); setCursor(0); history.current = []; errors.current = []; typing.current = []; incorrectChars.current = 0; recovery.current.clear(); focus();
    if (startAudio) speaker.play({ id: `${nextEpoch}:0:0`, text: nextTargets.slice(0, next.groupSize || 1).map(w => w.word).join(' ') }, next.voice || '', nextListening.rate);
  };
  const previousSuspended = useRef(suspended);
  useLayoutEffect(() => {
    if (previousSuspended.current !== suspended) {
      previousSuspended.current = suspended; reset(config, false);
    } else if (!suspended) focus();
  }, [suspended]);
  useLayoutEffect(() => {
    if (!suspended && !finished) inputRef.current?.focus();
  }, [epoch, suspended, finished]);
  useEffect(() => {
    const reveal = () => setControlsHidden(false);
    window.addEventListener('pointermove', reveal, { passive: true });
    window.addEventListener('pointerdown', reveal, { passive: true });
    return () => {
      window.removeEventListener('pointermove', reveal);
      window.removeEventListener('pointerdown', reveal);
    };
  }, []);
  useEffect(() => {
    if (startedAt === null || finished || suspended) return;
    const timer = window.setInterval(() => {
      const ms = active.mode === 'timed' ? Math.min(performance.now() - startedAt, active.duration * 1000) : performance.now() - startedAt;
      setElapsed(ms);
      if (Math.floor(ms / 1000) > Math.floor(history.current.at(-1)?.seconds || 0)) capture(Math.floor(ms / 1000) * 1000);
      if (active.mode === 'timed' && ms >= active.duration * 1000) { capture(ms, latestInput.current, true); setFinished(true); }
    }, 100);
    return () => window.clearInterval(timer);
  }, [startedAt, finished, suspended, active.mode, active.duration, targets]);
  useEffect(() => {
    if (score.done && !finished && startedAt !== null) {
      const ms = performance.now() - startedAt; setElapsed(ms); capture(ms, latestInput.current, true); setFinished(true);
    }
  }, [score.done, finished, startedAt]);
  useEffect(() => {
    if (active.mode === 'timed' && active.kind !== 'text' && !active.ordered && !finished && score.completed > targets.length - 40) {
      setTargets(previous => [...previous, ...generateWords(active.pool, 200)]);
    }
  }, [score.completed, targets.length, active, finished]);
  useEffect(() => { if (finished) resultsRef.current?.focus(); }, [finished]);
  const rate = active.kind === 'chords' ? (elapsed > 0 ? score.correct / (elapsed / 60000) : 0) : score.wpm;
  const missed = [...new Map(score.missed.map(w => [w.word, w])).values()];
  const finish = () => {
    if (startedAt !== null) { const ms = performance.now() - startedAt; setElapsed(ms); capture(ms, latestInput.current, true); setFinished(true); }
  };
  const toggleHints = () => {
    if (display === 'hidden') { setRevealedPrompt(previous => previous === promptId ? '' : promptId); focus(); return; }
    const hints = !active.hints;
    setActive(previous => ({ ...previous, hints })); onOptionsChange?.({ hints }); focus();
  };
  const handleKey = (event: KeyboardEvent) => {
    if (suspended || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') setControlsHidden(false);
    if (event.key === 'Escape') { event.preventDefault(); speaker.cancel(); onExit(); return; }
    const target = event.target;
    const control = target instanceof Element && target.closest('button,a,input,textarea,select,[contenteditable],dialog');
    if (control && control !== inputRef.current && !control.classList.contains('practice-focus')) return;
    if (event.key === 'Enter') { event.preventDefault(); reset(); }
    else if (event.key === ' ' && audio && !inputAllowed.current && !finished) { event.preventDefault(); play(); }
  };
  const keyboard = useRef(handleKey);
  keyboard.current = handleKey;
  useEffect(() => {
    const handle = (event: KeyboardEvent) => keyboard.current(event);
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, []);
  const hint = <div className="session-hint" role="group" aria-label="Hints" aria-hidden={!hintsVisible} data-visible={hintsVisible}>{revealed && <><p><strong>{current?.word}</strong><code>{current?.outline || 'No dictionary hint'}</code></p><StenoKeyboard outline={current?.outline}/></>}</div>;
  return <main className="session-shell" aria-label="Practice" data-controls-hidden={controlsHidden && startedAt !== null && !finished && !suspended} data-hint-position={active.hintPosition || 'above'} data-hint-text={active.hintTextSize || 'extra-large'} data-hint-keyboard={active.hintKeyboardSize || 'extra-large'} onFocusCapture={e => {
    if (e.target !== inputRef.current) setControlsHidden(false);
  }} onKeyDown={e => handleKey(e.nativeEvent)}>
    <header className="session-header"><Brand href={practiceHref} onClick={e => { e.preventDefault(); reset(); }}/><button className="icon-button session-controls" aria-label="Test settings" title="Test settings" onClick={() => { speaker.cancel(); onExit(); }}><Icon name="settings"/></button></header>
    {!finished ? <div className="test-stage">
      {active.hintPosition !== 'below' && <div className="hint-slot hint-above">{hint}</div>}
      <div className="test-status"><span className="session-clock" aria-label={active.mode === 'timed' ? 'Time left' : 'Elapsed time'}>{active.mode === 'timed' ? Math.ceil(remaining / 1000) : Math.floor(elapsed / 1000)}</span>{audio && !activated && <span className="audio-start-prompt" role="status">Press space to start</span>}</div>
      <PracticeSurface display={display} revealed={revealed} lines={active.lines || 3} targets={targets} input={input} projection={projection} project={assisted ? project : undefined} repetitions={options.repetitions} groupSize={options.groupSize} repeatOnError={options.repeatOnError} rawInput={options.inputMode === 'steno'} tokens={score.tokens} completed={score.completed} inputRef={inputRef} questionHints={active.questionHints} suspended={suspended} onHintChange={setCursor} onInput={value => {
        if (/[\r\n]/.test(value)) { reset(); return; }
        const previous = practiceText(latestInput.current, active.questionHints), text = practiceText(value, active.questionHints);
        if (active.questionHints && [...insertedText(latestInput.current, value)].filter(char => char === '?').length % 2) toggleHints();
        if (audio && !inputAllowed.current) {
          if (!text.trim()) { if (/\s/.test(text)) play(); return; }
          if (!revealed) return;
          play();
        }
        if (text !== previous) setControlsHidden(true);
        const now = performance.now(), ms = startedAt === null ? 0 : now - startedAt;
        if (assisted) {
          const before = project(latestInput.current);
          recovery.current = rebaseRecovery(recovery.current, latestInput.current, value);
          const metrics = wordPracticeMetrics(before, project(value));
          if (options.repeatOnError) for (const failure of metrics.failures) recovery.current.set(failure.target, failure.start);
          if (metrics.inserted) typing.current.push({ at: ms, characters: metrics.inserted });
          if (metrics.mistakes.length) {
            const mistakes = metrics.mistakes;
            errors.current.push({ seconds: ms / 1000, count: mistakes.length, mistakes });
            incorrectChars.current += metrics.incorrectChars;
          }
        } else {
          const metrics = inputMetrics(targets, previous, text);
          if (metrics.inserted) typing.current.push({ at: ms, characters: metrics.inserted });
          if (metrics.errors) errors.current.push({ seconds: ms / 1000, count: metrics.errors, mistakes: metrics.mistakes });
        }
        if (!audio && startedAt === null && text.trim()) setStartedAt(now);
        latestInput.current = value; setInput(value);
      }}/>
      <div className="test-actions session-controls">{audio && <button className="text-button audio-play" onClick={play}><Icon name="practice" size={18}/>{activated ? 'Replay' : 'Play'}</button>}<button className="icon-button" aria-label="Restart" title="Restart (Enter)" onClick={() => reset()}><Icon name="refresh"/></button><button className="icon-button hint-toggle" aria-label="Hints" title={active.questionHints ? options.inputMode === 'steno' ? 'Hints (?)' : 'Hints (? / H-F)' : 'Hints'} aria-pressed={hintsVisible} onClick={toggleHints}><Icon name="hint"/></button><button className="text-button small session-finish" disabled={startedAt === null} onClick={finish}>Finish</button></div>
      {active.hintPosition === 'below' && <div className="hint-slot hint-below">{hint}</div>}
      {audio && <div className="speech-status" role="status">{speechError && <span className="error">{speechError}</span>}</div>}
      {active.attribution && <p className="small muted passage-source session-controls">{active.attribution}</p>}
      <span className="sr-only">{score.completed} {active.kind === 'chords' ? 'chords' : 'words'} submitted{active.mode === 'count' ? ` of ${targets.length}` : ''}</span>
    </div> : <section className="session-results" tabIndex={-1} ref={resultsRef} aria-label="Practice results">
      <div className="results-grid"><div><span>{active.kind === 'chords' ? 'chords/min' : 'wpm'}</span><strong>{Math.round(rate)}</strong></div><div><span>word accuracy</span><strong>{Math.round(score.accuracy)}%</strong></div></div>
      <Suspense fallback={<div className="results-chart" role="status">Loading chart…</div>}><ResultsChart samples={history.current} errors={errors.current} chords={active.kind === 'chords'}/></Suspense>
      <dl className="result-details"><div><dt>test</dt><dd>{active.title}<small>{active.mode === 'timed' ? `${active.duration}s` : `${targets.length} ${active.kind === 'chords' ? 'chords' : 'words'}`}{options.groupSize > 1 ? ` · groups of ${options.groupSize}` : ''}{options.repetitions > 1 ? ` · ${options.repetitions} reps` : ''}{options.inputMode === 'steno' ? ' · raw steno' : ''}{options.repeatOnError ? ` · error ×${Math.max(options.repetitions, options.errorRepetitions)}` : ''}</small></dd></div>{active.kind !== 'chords' && <div><dt>raw wpm</dt><dd>{Math.round(score.rawWpm)}</dd></div>}<div><dt>time</dt><dd>{(elapsed / 1000).toFixed(1)}s</dd></div><div><dt>words</dt><dd>{score.correct}<small>{score.missed.length} incorrect</small></dd></div></dl>
      {missed.length > 0 && <details className="missed-words"><summary>{missed.length} missed {missed.length === 1 ? 'word' : 'words'}</summary><table><thead><tr><th>Word</th><th>Outline</th></tr></thead><tbody>{missed.map(w => <tr key={w.word}><td>{w.word}</td><td><code>{w.outline || '—'}</code></td></tr>)}</tbody></table><button className="text-button" onClick={() => reset({ ...active, title: 'Missed words', kind: active.kind === 'chords' ? 'chords' : 'words', pool: missed, ordered: false, attribution: undefined, mode: 'count', count: Math.max(10, missed.length) })}>Practice missed words</button></details>}
      <div className="button-row center"><button className="icon-button" aria-label="Restart" title="Restart (Enter)" onClick={() => reset(config)}><Icon name="refresh"/></button></div>
    </section>}
    <footer className="test-footer session-controls"><span><kbd>enter</kbd> restart</span>{active.questionHints && !finished && <span><kbd>?</kbd> hints</span>}<span><kbd>esc</kbd> settings</span></footer>
  </main>;
}
