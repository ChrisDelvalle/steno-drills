import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useApp } from '../context';
import { concepts } from '../domain/concepts';
import { eligibleWords, evaluateForFocus, selectedConcepts } from '../domain/vocabulary';
import { fingerSections, fingerSequence, invalidStrokes, keyboardSets, numberPassage, quotePassage, sentencePassage, symbolPool, techniqueSections, textWords, twoKeyText, wordDrills } from '../domain/exercises';
import type { Filter, HintSize, PracticePreferences, PracticeWord } from '../domain/types';
import { ConceptPicker, Empty, FilterControls, Icon } from '../components';

import { PracticeSession } from './Session';
import { TestSettings } from './TestSettings';
import { ShareControls } from './ShareControls';

const builtins = [
  ['bank', 'Words'], ['drills', 'Word drills'], ['chords', 'Keys / chords'], ['fingers', 'Finger drills'],
  ['sentences', 'Sentences'], ['two-key', 'Two-key sentences'], ['quotes', 'Quotes'],
  ['numbers', 'Numbers'], ['number-sentences', 'Number sentences'], ['symbols', 'Symbols'], ['text', 'Custom text'],
];

export function PracticeView({ settingsOpen, onSettings, onClose, navigation, settingsContent, warning }: {
  settingsOpen: boolean; onSettings: () => void; onClose: () => void;
  navigation: ReactNode; settingsContent?: ReactNode; warning: string;
}) {
  const { testProfile: profile, setTestProfile: setProfile, testWords: words, testWordMap: wordMap, source, setSource, shared, saveShared, exitShared, routeHash } = useApp();
  const preferences = profile.practice;
  const { restricted, drill, mixed, keyboardSet, fingerBook, section, pattern, repeats, customPatterns, quoteLength, symbolVariants } = preferences;
  const setter = <K extends keyof PracticePreferences,>(key: K) => (value: PracticePreferences[K] | ((current: PracticePreferences[K]) => PracticePreferences[K])) => {
    setProfile(p => ({ ...p, practice: { ...p.practice, [key]: typeof value === 'function' ? value(p.practice[key]) : value } }));
  };
  const setRestricted = setter('restricted'), setDrill = setter('drill'), setMixed = setter('mixed'), setKeyboardSet = setter('keyboardSet');
  const setPattern = setter('pattern'), setRepeats = setter('repeats');
  const setCustomPatterns = setter('customPatterns'), setQuoteLength = setter('quoteLength'), setSymbolVariants = setter('symbolVariants');
  const list = profile.lists.find(l => `list:${l.id}` === source);
  const saved = profile.exercises.find(e => `filter:${e.id}` === source);
  const filter = saved?.filter || profile.filter;
  const session = profile.session;
  const [reading, setReading] = useState<{ key: string; text: string; source: string } | null>(null);
  const [readingError, setReadingError] = useState('');
  const readingKey = `${source}:${quoteLength}:${session.mode}:${session.count}`;
  const isReading = source === 'sentences' || source === 'quotes';
  useEffect(() => {
    if (!isReading) return;
    let current = true; setReadingError('');
    const request = source === 'quotes' ? quotePassage(quoteLength) : sentencePassage(session.mode === 'timed' ? 1000 : session.count);
    request.then(passage => { if (current) setReading({ key: readingKey, ...passage }); }).catch(() => { if (current) setReadingError('Exercise could not load. Reload to retry.'); });
    return () => { current = false; };
  }, [readingKey, isReading, source, quoteLength, session.mode, session.count]);
  const isWordList = source === 'drills' || Boolean(list);
  const isWords = source === 'bank' || Boolean(saved) || isWordList;
  const isRaw = source === 'chords' || source === 'fingers';
  const ordered = ['fingers','sentences','two-key','quotes','number-sentences','text'].includes(source);
  const updateSession = (patch: Partial<typeof session>) => setProfile(p => ({ ...p, session: { ...p.session, ...patch } }));
  const updateFilter = (next: Filter) => setProfile(p => saved ? { ...p, exercises: p.exercises.map(e => e.id === saved.id ? { ...e, filter: next } : e) } : { ...p, filter: next });
  const patterns = fingerBook === 'custom' ? customPatterns.toUpperCase().trim().split(/\s+/).filter(Boolean) : fingerBook === 'technique' ? techniqueSections['1A'] : fingerSections[section];
  const activePatterns = fingerBook === 'custom' || pattern === -1 ? patterns : patterns.slice(pattern, pattern + 1);
  const title = list?.name || saved?.name || (source === 'drills' ? drill === 'custom' ? 'Word drills' : wordDrills.find(d => d.id === drill)?.label : undefined) || builtins.find(([id]) => id === source)?.[1] || 'Words';
  const practice = useMemo(() => {
    const ids = selectedConcepts(filter, profile.learned);
    let pool: PracticeWord[] = [], attribution: string | undefined;
    let kind: 'words' | 'chords' | 'text' = isRaw ? 'chords' : ordered ? 'text' : 'words';
    const unrestricted = !isWords && !isRaw || Boolean(isWordList && !restricted);
    if (source === 'text') pool = textWords(profile.customText, wordMap);
    else if (isReading) {
      if (reading?.key === readingKey) { pool = textWords(reading.text, wordMap); attribution = reading.source; }
    } else if (source === 'two-key') pool = textWords(twoKeyText, wordMap);
    else if (source === 'number-sentences') pool = textWords(numberPassage(session.mode === 'timed' ? 1000 : session.count), wordMap);
    else if (source === 'numbers') pool = Array.from({ length: 99 }, (_, i) => ({ word: String(i + 1) }));
    else if (source === 'symbols') pool = symbolPool(symbolVariants);
    else if (source === 'chords') {
      const shapes = keyboardSet === 'selected' ? concepts.filter(c => c.bank !== 'brief' && ids.includes(c.id)).map(c => c.keys) : keyboardSets[keyboardSet];
      pool = [...new Set(shapes)].map(word => ({ word, outline: word }));
    } else if (source === 'fingers') { pool = fingerSequence(activePatterns, repeats); kind = 'chords'; }
    else if (isWordList) {
      const membership = list?.words || wordDrills.filter(d => drill === 'custom' ? mixed.includes(d.id) : d.id === drill).flatMap(d => d.words);
      pool = [...new Set(membership.flatMap(w => w.split(/\s+/)))].flatMap(word => {
        const entry = wordMap.get(word);
        const result = entry ? evaluateForFocus(entry, profile, filter.focus, filter) : null;
        if (restricted) return result?.eligible ? [{ word, outline: result.outline }] : [];
        return [{ word, outline: entry?.outlines[0]?.outline }];
      });
    } else pool = eligibleWords(words, profile, filter);
    return { pool, kind, unrestricted, attribution };
  }, [source, filter, profile.learned, profile.excluded, profile.customText, words, wordMap, session.mode, session.count, restricted, list, isWords, isRaw, isWordList, ordered, drill, mixed, keyboardSet, fingerBook, section, pattern, customPatterns, repeats, quoteLength, symbolVariants, isReading, reading, readingKey]);
  const config = useMemo(() => ({ title, ...practice, ordered, ...session }), [title, practice, ordered, session]);
  const sessionKey = JSON.stringify({ preferences, filter, learned: profile.learned, corrections: profile.corrections, excluded: profile.excluded, text: profile.customText, lists: profile.lists, mode: session.mode, duration: session.duration, count: session.count });
  const controls = <section className="practice-setup" aria-label="Practice setup">
    {shared && <div className="shared-test"><span className="small muted">Shared test</span><button className="text-button small" onClick={saveShared}>Save settings</button><button className="text-button small" onClick={exitShared}>Exit</button></div>}
    <label className="field">Exercise<select aria-label="Exercise" value={source} onChange={e => setSource(e.target.value)}>
      {builtins.filter(([id]) => !shared || id !== 'text').map(([id, label]) => <option key={id} value={id}>{label}</option>)}
      {profile.lists.length > 0 && <optgroup label="My lists">{profile.lists.map(l => <option key={l.id} value={`list:${l.id}`}>{l.name}</option>)}</optgroup>}
      {profile.exercises.length > 0 && <optgroup label="Saved filters">{profile.exercises.map(e => <option key={e.id} value={`filter:${e.id}`}>{e.name}</option>)}</optgroup>}
    </select></label>
    {source === 'drills' && <>
      <label className="field">Drill<select aria-label="Drill" value={drill} onChange={e => setDrill(e.target.value)}><option value="custom">Custom mix</option>{['Word drills','Learn Plover','Intro'].map(group => <optgroup label={group} key={group}>{wordDrills.filter(d => d.group === group).map(d => <option value={d.id} key={d.id}>{d.label}</option>)}</optgroup>)}</select></label>
      {drill === 'custom' && <fieldset className="drill-checklist"><legend>Word drills</legend><div className="concept-actions"><button className="text-button" onClick={() => setMixed(wordDrills.map(d => d.id))}>Select all</button><button className="text-button" onClick={() => setMixed([])}>Clear</button></div><div className="drill-grid">{wordDrills.map(d => <label className="check-line" key={d.id}><input type="checkbox" checked={mixed.includes(d.id)} onChange={() => setMixed(previous => previous.includes(d.id) ? previous.filter(id => id !== d.id) : [...previous, d.id])}/>{d.group === 'Learn Plover' ? `Learn Plover · ${d.label}` : d.label}</label>)}</div></fieldset>}
    </>}
    {isWordList && <label className="check-line"><input type="checkbox" checked={restricted} onChange={e => setRestricted(e.target.checked)}/>Filter by concepts</label>}
    {isWords && (!isWordList ? <FilterControls learned={profile.learned} filter={filter} onChange={updateFilter} lengths={false}/> : restricted && <ConceptPicker learned={profile.learned} filter={filter} onChange={updateFilter}/>)}
    {source === 'chords' && <>
      <label className="field">Keys<select aria-label="Keys" value={keyboardSet} onChange={e => setKeyboardSet(e.target.value)}><option value="selected">Selected concepts</option>{Object.keys(keyboardSets).map(name => <option key={name}>{name}</option>)}</select></label>
      {keyboardSet === 'selected' && <ConceptPicker learned={profile.learned} filter={filter} onChange={updateFilter}/>}
    </>}
    {source === 'fingers' && <>
      <label className="field">Pattern set<select aria-label="Pattern set" value={fingerBook} onChange={e => { const fingerBook = e.target.value as typeof preferences.fingerBook; setProfile(p => ({ ...p, practice: { ...p.practice, fingerBook, section: 0, pattern: 0 } })); }}><option value="duo">Dueling Digit Duo</option><option value="technique">Stenotype Finger Technique</option>{!shared && <option value="custom">Custom</option>}</select></label>
      {fingerBook === 'duo' && <label className="field">Section<select aria-label="Section" value={section} onChange={e => { const section = +e.target.value; setProfile(p => ({ ...p, practice: { ...p.practice, section, pattern: 0 } })); }}>{fingerSections.map((_, i) => <option key={i} value={i}>{i + 1}</option>)}</select></label>}
      {fingerBook === 'custom' ? <label className="field">Patterns<input aria-label="Patterns" value={customPatterns} maxLength={2000} onChange={e => setCustomPatterns(e.target.value)}/><span className="field-help">Separate strokes with / and patterns with spaces.</span></label> : <label className="field">Pattern<select aria-label="Pattern" value={pattern} onChange={e => setPattern(+e.target.value)}><option value={-1}>All</option>{patterns.map((s, i) => <option key={i} value={i}>{s}</option>)}</select></label>}
      <label className="field">Repeats<select aria-label="Repeats" value={repeats} onChange={e => setRepeats(+e.target.value)}>{[5,10,20,50].map(n => <option key={n}>{n}</option>)}</select></label>
      {invalidStrokes(activePatterns).length > 0 && <p className="error" role="alert">Invalid steno: {invalidStrokes(activePatterns).join(', ')}</p>}
    </>}
    {isRaw && <p className="field-note">Disable translating dictionaries in Plover to send raw steno.</p>}
    {source === 'quotes' && <label className="field">Quote length<select aria-label="Quote length" value={quoteLength} onChange={e => setQuoteLength(e.target.value as typeof quoteLength)}><option value="short">Short</option><option value="medium">Medium</option><option value="long">Long</option></select></label>}
    {source === 'symbols' && <><label className="check-line"><input type="checkbox" checked={symbolVariants} onChange={e => setSymbolVariants(e.target.checked)}/>Include variants</label><p className="field-note">Enable Emily’s Symbols with spacing.</p></>}
    {source === 'text' && <label className="field">Text<textarea rows={6} maxLength={100000} value={profile.customText} onChange={e => setProfile(p => ({ ...p, customText: e.target.value }))} placeholder="Paste text…"/></label>}
    <hr/>
    <div className="session-options"><label>Session<select aria-label="Session" value={session.mode} onChange={e => updateSession({ mode: e.target.value as 'timed' | 'count' })}><option value="timed">Timed</option><option value="count">{ordered ? 'Passage' : 'Count'}</option></select></label>
      {session.mode === 'timed' ? <label>Duration<select aria-label="Duration" value={session.duration} onChange={e => updateSession({ duration: +e.target.value })}>{[30,60,90,120,300].map(n => <option value={n} key={n}>{n}s</option>)}</select></label> : (!ordered || ['sentences','number-sentences'].includes(source)) && <label>Length<select aria-label="Length" value={session.count} onChange={e => updateSession({ count: +e.target.value })}>{[10,25,50,100,250,500].map(n => <option value={n} key={n}>{n} {isRaw ? 'strokes' : 'words'}</option>)}</select></label>}
    </div>
    <label className="check-line"><input type="checkbox" checked={session.hints} onChange={e => updateSession({ hints: e.target.checked })}/>Hints</label>
    <div className="session-options"><label>Lines<select aria-label="Lines" value={session.lines} onChange={e => updateSession({ lines: +e.target.value })}>{[3,4,5,6,7,8].map(n => <option key={n}>{n}</option>)}</select></label><label>Hint position<select aria-label="Hint position" value={session.hintPosition} onChange={e => updateSession({ hintPosition: e.target.value as 'above' | 'below' })}><option value="above">Above</option><option value="below">Below</option></select></label></div>
    <div className="session-options hint-size-options">{(['hintTextSize','hintKeyboardSize'] as const).map(key => <label key={key}>{key === 'hintTextSize' ? 'Hint text size' : 'Keyboard size'}<select aria-label={key === 'hintTextSize' ? 'Hint text size' : 'Keyboard size'} value={session[key]} onChange={e => updateSession({ [key]: e.target.value as HintSize })}>{(['small','medium','large','extra-large'] as const).map(value => <option key={value} value={value}>{value === 'extra-large' ? 'Extra large' : value[0].toUpperCase() + value.slice(1)}</option>)}</select></label>)}</div>
    {readingError ? <p className="error" role="alert">{readingError}</p> : isReading && reading?.key !== readingKey ? <p className="pool-summary" role="status">Loading exercise…</p> : !practice.pool.length ? <Empty title="No matches">Change the concepts{isWordList ? ' or turn off the filter' : ''}.</Empty> : <div className="pool-summary">{practice.pool.length.toLocaleString()} {isRaw ? practice.pool.length === 1 ? 'stroke' : 'strokes' : practice.pool.length === 1 ? 'word' : 'words'}{practice.unrestricted && <span className="tag">Unrestricted</span>}</div>}
    <div className="test-settings-actions"><button className="primary start-button" disabled={!practice.pool.length} onClick={onClose}>Done</button><ShareControls profile={profile} disabled={!practice.pool.length}/></div>
  </section>;
  return <>
    {practice.pool.length ? <PracticeSession key={sessionKey} config={config} onExit={onSettings} suspended={settingsOpen} onOptionsChange={updateSession} practiceHref={routeHash('practice')}/> :
      <main className="session-shell"><header className="session-header"><a className="session-brand" href={routeHash('practice')}>Steno Drills</a><button className="icon-button" aria-label="Test settings" onClick={onSettings}><Icon name="settings"/></button></header><div className="home-empty">{readingError || (isReading && reading?.key !== readingKey ? 'Loading exercise…' : 'No matching words.')}<button className="text-button" onClick={onSettings}>Test settings</button></div></main>}
    {warning && !settingsOpen && <p className="storage-warning" role="status">{warning} <a href={routeHash('settings')}>Backup & recovery</a></p>}
    {settingsOpen && <TestSettings onClose={onClose} navigation={navigation}>{warning && <p className="notice warning" role="status">{warning} <a href={routeHash('settings')}>Backup & recovery</a></p>}{settingsContent || controls}</TestSettings>}
  </>;
}
