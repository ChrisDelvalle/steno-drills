import { useEffect, useMemo, useState } from 'react';
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

const navigation = [
  ['test-settings', 'Test', 'practice'], ['skills', 'Skills', 'skills'], ['words', 'Word Bank', 'words'],
  ['exercises', 'Exercises', 'exercises'], ['settings', 'Settings', 'settings'],
];
const getRoute = () => {
  const route = window.location.hash.slice(2).split('?')[0];
  return navigation.some(([id]) => id === route) ? route : 'practice';
};

export function App() {
  const [loaded] = useState(() => loadProfile(() => window.localStorage));
  const [profile, setProfile] = useState(loaded.profile);
  const [writable, setWritable] = useState(loaded.writable);
  const [warning, setWarning] = useState(loaded.warning);
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [fontReady, setFontReady] = useState(() => !document.fonts);
  const [loadError, setLoadError] = useState('');
  const [route, setRoute] = useState(getRoute);
  useEffect(() => {
    if (!document.fonts) return;
    document.fonts.load('32px "Roboto Mono"').then(() => setFontReady(true), () => setFontReady(true));
  }, []);
  const source = profile.practice.source;
  const setSource = (source: string) => setProfile(p => ({ ...p, practice: { ...p.practice, source } }));
  useEffect(() => {
    if (source.startsWith('list:') && !profile.lists.some(l => `list:${l.id}` === source)) setSource('bank');
    if (source.startsWith('filter:') && !profile.exercises.some(e => `filter:${e.id}` === source)) setSource('bank');
  }, [source, profile.lists, profile.exercises]);
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
    const change = () => { setRoute(getRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  useEffect(() => { document.title = `${navigation.find(([id]) => id === route)?.[1] || 'Practice'} · Steno Drills`; }, [route]);
  const words = useMemo(() => applyCorrections(dictionary?.words || [], profile), [dictionary, profile.corrections]);
  const wordMap = useMemo(() => new Map(words.map(w => [w.word, w])), [words]);
  const replaceProfile = (next: Profile) => {
    setProfile(next); setWritable(true);
    setWarning(saveProfile(() => window.localStorage, next) ? '' : 'The profile is loaded in memory, but browser storage is unavailable. Export a backup before leaving.');
  };
  const closeSettings = () => { window.location.hash = '/practice'; };
  return <AppContext.Provider value={{ profile, setProfile, dictionary: dictionary!, words, wordMap, source, setSource,
    goPractice: (next = 'bank') => {
      if (next.startsWith('drill:')) setProfile(p => ({ ...p, practice: { ...p.practice, source: 'drills', drill: next.slice(6) } }));
      else setSource(next);
      window.location.hash = '/test-settings';
    }, warning, replaceProfile }}>
    {loadError ? <main className="loading" role="alert"><div><p>{loadError}</p><button onClick={() => window.location.reload()}>Reload</button></div></main> : !dictionary || !fontReady ? <main className="loading" role="status">Loading…</main> :
      <PracticeView settingsOpen={route !== 'practice'} onSettings={() => { window.location.hash = '/test-settings'; }} onClose={closeSettings}
        warning={warning}
        navigation={<nav aria-label="Settings navigation">{navigation.map(([id, label, icon]) => <a key={id} href={`#/${id}`} className={route === id ? 'active' : ''} aria-current={route === id ? 'page' : undefined}><Icon name={icon}/><span>{label}</span></a>)}</nav>}
        settingsContent={route === 'skills' ? <SkillsView/> : route === 'words' ? <WordBankView/> : route === 'exercises' ? <ExercisesView/> : route === 'settings' ? <SettingsView/> : undefined}/>
    }
  </AppContext.Provider>;
}
