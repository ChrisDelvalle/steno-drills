import { useEffect, useMemo, useState } from 'react';
import type { SetStateAction } from 'react';
import { AppContext } from './context';
import { loadProfile, saveProfile } from './domain/profile';
import { applyCorrections } from './domain/vocabulary';
import type { Dictionary, Profile } from './domain/types';
import { Icon } from './components';
import { PracticeView } from './views/Practice';
import { SkillsView } from './views/Skills';
import { WordBankView } from './views/WordBank';
import { ExercisesView } from './views/Exercises';
import { SettingsView } from './views/Settings';
import { applySharedTest, encodeSharedTest, normalizeSharedTest, parseTestLocation, saveSharedTest, sharedHash } from './domain/sharing';

const navigation = [
  ['test-settings', 'Test', 'practice'], ['skills', 'Skills', 'skills'], ['words', 'Word Bank', 'words'],
  ['exercises', 'Exercises', 'exercises'], ['settings', 'Settings', 'settings'],
];
export function App() {
  const [loaded] = useState(() => loadProfile(() => window.localStorage));
  const [state, setState] = useState(() => ({ profile: loaded.profile, location: parseTestLocation(window.location.hash), draft: null as Profile | null }));
  const { profile, location } = state;
  const { route, shared } = location;
  const setProfile = (next: SetStateAction<Profile>) => setState(s => ({ ...s, profile: typeof next === 'function' ? next(s.profile) : next }));
  const [writable, setWritable] = useState(loaded.writable);
  const [warning, setWarning] = useState(loaded.warning);
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [fontReady, setFontReady] = useState(() => !document.fonts);
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!document.fonts) return;
    document.fonts.load('32px "Roboto Mono"').then(() => setFontReady(true), () => setFontReady(true));
  }, []);
  const effectiveTest = (personal: Profile, location: typeof state.location, draft: Profile | null) => {
    if (!location.shared) return personal;
    const effective = applySharedTest(personal, location.shared);
    return draft ? { ...effective, practice: draft.practice, filter: draft.filter,
      session: { ...effective.session, mode: draft.session.mode, duration: draft.session.duration, count: draft.session.count, hints: draft.session.hints } } : effective;
  };
  const testProfile = useMemo(() => effectiveTest(profile, location, state.draft), [profile, shared, state.draft]);
  const setTestProfile = (update: SetStateAction<Profile>) => setState(s => {
    const current = effectiveTest(s.profile, s.location, s.draft);
    const next = typeof update === 'function' ? update(current) : update;
    if (!s.location.shared) return { ...s, profile: next };
    const result = normalizeSharedTest(next);
    if (!result.ok) return s;
    const { lines, hintPosition, hintTextSize, hintKeyboardSize } = next.session;
    const visuals = { lines, hintPosition, hintTextSize, hintKeyboardSize };
    const visualChange = (Object.keys(visuals) as (keyof typeof visuals)[]).some(key => visuals[key] !== s.profile.session[key]);
    return { draft: next, profile: visualChange ? { ...s.profile, session: { ...s.profile.session, ...visuals } } : s.profile,
      location: { ...s.location, token: encodeSharedTest(result.value), shared: result.value } };
  });
  const source = testProfile.practice.source;
  const setSource = (source: string) => setTestProfile(p => ({ ...p, practice: { ...p.practice, source } }));
  useEffect(() => {
    const personalSource = profile.practice.source;
    if ((personalSource.startsWith('list:') && !profile.lists.some(l => `list:${l.id}` === personalSource)) ||
      (personalSource.startsWith('filter:') && !profile.exercises.some(e => `filter:${e.id}` === personalSource))) {
      setProfile(p => ({ ...p, practice: { ...p.practice, source: 'bank' } }));
    }
  }, [profile.practice.source, profile.lists, profile.exercises]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${import.meta.env.BASE_URL}dictionary.json`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(`Dictionary request failed (${response.status}).`); return response.json(); })
      .then((value: Dictionary) => { if (value.version !== 1 || !Array.isArray(value.words)) throw new Error('The dictionary index is invalid.'); setDictionary(value); })
      .catch(error => { if (error.name !== 'AbortError') setLoadError('The word bank could not load. Check your connection and reload.'); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (writable && !saveProfile(() => window.localStorage, profile)) setWarning('Browser storage is unavailable or full. Changes work in memory; export a backup before leaving.');
  }, [profile, writable]);
  useEffect(() => {
    if (profile.theme === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = profile.theme;
  }, [profile.theme]);
  useEffect(() => {
    const change = () => { setState(s => {
      const location = parseTestLocation(window.location.hash);
      return { ...s, location, draft: location.token === s.location.token && !location.error ? s.draft : null };
    }); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => {
    if (location.error) return;
    const hash = sharedHash(route + (location.query ? `?${location.query}` : ''), location.token);
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash);
  }, [location]);
  useEffect(() => { document.title = `${navigation.find(([id]) => id === route)?.[1] || 'Practice'} · Steno Drills`; }, [route]);
  const words = useMemo(() => applyCorrections(dictionary?.words || [], profile), [dictionary, profile.corrections]);
  const wordMap = useMemo(() => new Map(words.map(w => [w.word, w])), [words]);
  const testWords = shared ? dictionary?.words || [] : words;
  const testWordMap = useMemo(() => new Map(testWords.map(w => [w.word, w])), [testWords]);
  const replaceProfile = (next: Profile) => {
    setProfile(next); setWritable(true);
    setWarning(saveProfile(() => window.localStorage, next) ? '' : 'The profile is loaded in memory, but browser storage is unavailable. Export a backup before leaving.');
  };
  const routeHash = (route: string) => sharedHash(route, location.token);
  const closeSettings = () => { window.location.hash = routeHash('practice'); };
  return <AppContext.Provider value={{ profile, setProfile, dictionary: dictionary!, words, wordMap, source, setSource,
    testProfile, setTestProfile, testWords, testWordMap, shared, routeHash,
    saveShared: () => setState(s => s.location.shared ? { draft: null, profile: saveSharedTest(s.profile, s.location.shared), location: { ...s.location, token: undefined, shared: null } } : s),
    exitShared: () => setState(s => ({ ...s, draft: null, location: { route: 'practice', token: undefined, shared: null, error: '' } })),
    goPractice: (next = 'bank') => {
      setState(s => ({ draft: null, profile: { ...s.profile, practice: next.startsWith('drill:') ? { ...s.profile.practice, source: 'drills', drill: next.slice(6) } : { ...s.profile.practice, source: next } },
        location: { route: 'test-settings', token: undefined, shared: null, error: '' } }));
      window.location.hash = '/test-settings';
    }, warning, replaceProfile }}>
    {location.error ? <main className="loading" role="alert"><div><p>{location.error}</p><button onClick={() => setState(s => ({ ...s, location: { route: 'practice', token: undefined, shared: null, error: '' } }))}>Open practice</button></div></main> : loadError ? <main className="loading" role="alert"><div><p>{loadError}</p><button onClick={() => window.location.reload()}>Reload</button></div></main> : !dictionary || !fontReady ? <main className="loading" role="status">Loading…</main> :
      <PracticeView settingsOpen={route !== 'practice'} onSettings={() => { window.location.hash = routeHash('test-settings'); }} onClose={closeSettings}
        warning={warning}
        navigation={<nav aria-label="Settings navigation">{navigation.map(([id, label, icon]) => <a key={id} href={routeHash(id)} className={route === id ? 'active' : ''} aria-current={route === id ? 'page' : undefined}><Icon name={icon}/><span>{label}</span></a>)}</nav>}
        settingsContent={route === 'skills' ? <SkillsView/> : route === 'words' ? <WordBankView/> : route === 'exercises' ? <ExercisesView/> : route === 'settings' ? <SettingsView/> : undefined}/>
    }
  </AppContext.Provider>;
}
