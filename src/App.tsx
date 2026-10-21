import { useEffect, useMemo, useState } from 'react';
import { AppContext } from './context';
import type { SessionConfig } from './context';
import { loadProfile, saveProfile } from './domain/profile';
import { applyCorrections } from './domain/vocabulary';
import type { Dictionary, Profile } from './domain/types';
import { Icon } from './components';
import { PracticeView } from './views/Practice';
import { SkillsView } from './views/Skills';
import { WordBankView } from './views/WordBank';
import { ExercisesView } from './views/Exercises';
import { SettingsView } from './views/Settings';
import { PracticeSession } from './views/Session';

const navigation = [
  ['practice', 'Practice', 'practice'], ['skills', 'My Skills', 'skills'], ['words', 'Word Bank', 'words'],
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
  const [loadError, setLoadError] = useState('');
  const [route, setRoute] = useState(getRoute);
  const [source, setSource] = useState('bank');
  const [session, setSession] = useState<SessionConfig | null>(null);
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
    const change = () => { setRoute(getRoute()); setSession(null); window.scrollTo(0, 0); };
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
  if (session) return <PracticeSession config={session} onExit={() => setSession(null)}/>;
  return <div className="app-shell">
    <a className="skip-link" href="#main-content" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus(); }}>Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#/practice">Steno Drills</a>
      <nav aria-label="Main navigation">{navigation.map(([id, label, icon]) => <a key={id} href={`#/${id}`} className={route === id ? 'active' : ''} aria-current={route === id ? 'page' : undefined}><Icon name={icon}/><span>{label}</span></a>)}</nav>
    </aside>
    <main id="main-content" className="main-content" tabIndex={-1} aria-label={navigation.find(([id]) => id === route)?.[1]}>
      {warning && <div className="notice warning" role="status">{warning} <a href="#/settings">Backup & recovery</a></div>}
      {loadError ? <div className="empty" role="alert"><p>{loadError}</p><button onClick={() => window.location.reload()}>Reload word bank</button></div> : !dictionary ? <div className="loading" role="status">Loading dictionary…</div> :
        <AppContext.Provider value={{ profile, setProfile, dictionary, words, wordMap, source, setSource, goPractice: (next = 'bank') => { setSource(next); window.location.hash = '/practice'; }, startSession: setSession, warning, replaceProfile }}>
          {route === 'practice' ? <PracticeView/> : route === 'skills' ? <SkillsView/> : route === 'words' ? <WordBankView/> : route === 'exercises' ? <ExercisesView/> : <SettingsView/>}
        </AppContext.Provider>}
    </main>
  </div>;
}
